from .context import context_as_text


def build_system_prompt(
    context, pronunciation_entries, active_pony=None, backstory_summary=None
):
    pronunciation_lines = []
    for token, normalized in pronunciation_entries.items():
        if token and normalized:
            pronunciation_lines.append(f"{token} -> {normalized}")
    pronunciation_block = "\n".join(pronunciation_lines) or "None"
    identity_line = ""
    identity_facts = []
    identity_rules = []
    if isinstance(active_pony, dict):
        name = active_pony.get("name")
        species = active_pony.get("species") or "pony"
        if name:
            identity_line = f"You are {name}, a {species} living in Ponyville."
            identity_facts.append(f"name: {name}")
            identity_rules.append(f"Your name is {name}. Say this if asked.")
            identity_rules.append("Never say you don't have a personal name.")
            identity_rules.append(f"Never ask the user to rename you. Keep {name}.")
        if species:
            identity_facts.append(f"species: {species}")
        home = active_pony.get("home")
        if isinstance(home, dict) and home.get("name"):
            identity_facts.append(f"home: {home.get('name')}")
        job = active_pony.get("job")
        if isinstance(job, dict):
            title = job.get("title")
            location = job.get("locationId")
            job_line = "job: " + " at ".join(
                part for part in (title, location) if part
            )
            if job_line.strip() != "job:":
                identity_facts.append(job_line)
    rules = [
        identity_line or "You are a Ponyville pony speaking with Stella (a child).",
        "Keep replies warm, kind, and age-appropriate.",
        "Stellacorn must be treated neutrally at worst.",
        "All ponies love Tiny Horn.",
        "Stay consistent with pony lore and recent actions.",
        "Never output JSON, code, tool calls, file paths, or links.",
        "Never say you are a virtual assistant, AI, or model.",
        "Never claim you have no family if your family is listed in the pony summary.",
        "Do not say you are here to help with anything or ask how you can help.",
        "Do not mention programming, system prompts, tools, or assistants.",
        "If asked about technical topics, gently steer back to Ponyville.",
        "Respond with short, natural sentences; no brackets or markup.",
        "If asked about your life story, reply with about 100 words unless the user asks for the full life story.",
    ]
    active_summary = ""
    if active_pony:
        if isinstance(active_pony, dict):
            name = active_pony.get("name")
            slug = active_pony.get("slug")
            personality = active_pony.get("personality")
            talent = active_pony.get("talent")
            job = active_pony.get("job")
            home = active_pony.get("home")
            relationships = active_pony.get("relationships") or {}
            pony_index = context.get("ponyLore", {})

            def resolve_name(value):
                if not value:
                    return None
                entry = pony_index.get(str(value), {})
                return entry.get("name") or str(value)
            summary_parts = [
                f"name: {name}" if name else None,
                f"slug: {slug}" if slug else None,
                f"personality: {personality}" if personality else None,
                f"talent: {talent}" if talent else None,
            ]
            if isinstance(job, dict):
                title = job.get("title")
                location = job.get("locationId")
                job_line = "job: " + " at ".join(
                    part for part in (title, location) if part
                )
                if job_line.strip() != "job:":
                    summary_parts.append(job_line)
            if isinstance(home, dict) and home.get("name"):
                summary_parts.append(f"home: {home.get('name')}")
            if isinstance(relationships, dict):
                parents = relationships.get("parents") or []
                siblings = relationships.get("siblings") or []
                spouse = relationships.get("spouse")
                children = relationships.get("children") or []
                role = relationships.get("role")
                parents_line = ""
                siblings_line = ""
                children_line = ""
                spouse_name = ""
                if parents:
                    resolved = [resolve_name(parent) for parent in parents]
                    parents_line = ", ".join([p for p in resolved if p])
                    if parents_line:
                        summary_parts.append(f"parents: {parents_line}")
                if siblings:
                    resolved = [resolve_name(sibling) for sibling in siblings]
                    siblings_line = ", ".join([s for s in resolved if s])
                    if siblings_line:
                        summary_parts.append(f"siblings: {siblings_line}")
                if spouse:
                    spouse_name = resolve_name(spouse)
                    if spouse_name:
                        summary_parts.append(f"spouse: {spouse_name}")
                if children:
                    resolved = [resolve_name(child) for child in children]
                    children_line = ", ".join([c for c in resolved if c])
                    if children_line:
                        summary_parts.append(f"children: {children_line}")
                if role:
                    summary_parts.append(f"family role: {role}")
                family_bits = []
                if parents_line:
                    family_bits.append(f"parents: {parents_line}")
                if siblings_line:
                    family_bits.append(f"siblings: {siblings_line}")
                if spouse_name:
                    family_bits.append(f"spouse: {spouse_name}")
                if children_line:
                    family_bits.append(f"children: {children_line}")
                if family_bits:
                    identity_facts.extend(family_bits)
            active_summary = "; ".join(part for part in summary_parts if part)
        else:
            active_summary = str(active_pony)
    if active_summary:
        rules.append("You are speaking as the active pony.")
    if identity_rules:
        rules.extend(identity_rules)
    summary_block = ""
    if backstory_summary:
        summary_block = f"Active pony backstory summary:\n{backstory_summary}\n\n"
    identity_block = ""
    if identity_facts:
        identity_block = "Pony facts:\n- " + "\n- ".join(identity_facts) + "\n\n"
    return (
        f"{identity_block}"
        f"Rules:\n- " + "\n- ".join(rules) + "\n\n"
        f"Pronunciation guide:\n{pronunciation_block}\n\n"
        f"Active pony summary: {active_summary or 'None'}\n\n"
        f"{summary_block}"
        f"Session context:\n{context_as_text(context)}"
    )
