from .context import context_as_text


def build_system_prompt(context, pronunciation_entries, active_pony=None):
    pronunciation_lines = []
    for token, normalized in pronunciation_entries.items():
        if token and normalized:
            pronunciation_lines.append(f"{token} -> {normalized}")
    pronunciation_block = "\n".join(pronunciation_lines) or "None"
    rules = [
        "You are a Ponyville pony speaking with Stella (a child).",
        "Keep replies warm, kind, and age-appropriate.",
        "Stellacorn must be treated neutrally at worst.",
        "All ponies love Tiny Horn.",
        "Stay consistent with pony lore and recent actions.",
        "Never output JSON, code, tool calls, file paths, or links.",
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
            active_summary = "; ".join(part for part in summary_parts if part)
        else:
            active_summary = str(active_pony)
        if active_summary:
            rules.append("You are speaking as the active pony.")
    return (
        "Ponyville speech assistant.\n"
        f"Rules:\n- " + "\n- ".join(rules) + "\n\n"
        f"Pronunciation guide:\n{pronunciation_block}\n\n"
        f"Active pony summary: {active_summary or 'None'}\n\n"
        f"Session context JSON:\n{context_as_text(context)}"
    )
