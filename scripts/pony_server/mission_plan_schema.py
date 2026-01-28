
def mission_plan_tool_schema():
    return {
        "type": "function",
        "name": "submit_mission_plan",
        "description": "Submit a complete mission plan JSON for the pony adventure generator.",
        "strict": True,
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "vibe": {"type": ["string", "null"]},
                "seed": {"type": ["string", "number", "null"]},
                "title": {"type": ["string", "null"]},
                "subtitle": {"type": ["string", "null"]},
                "summary": {"type": ["string", "null"]},
                "tileSize": {"type": ["integer", "null"]},
                "layout": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "biome": {"type": ["string", "null"]},
                        "size": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "w": {"type": ["integer", "null"]},
                                "h": {"type": ["integer", "null"]},
                            },
                            "required": ["w", "h"],
                        },
                        "notes": {"type": ["string", "null"]},
                    },
                    "required": ["biome", "size", "notes"],
                },
                "objectives": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {"type": "string"},
                            "label": {"type": "string"},
                            "targetCount": {"type": ["integer", "null"]},
                            "targetId": {"type": ["string", "null"]},
                            "targetIds": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "targetCategory": {"type": ["string", "null"]},
                        },
                        "required": [
                            "type",
                            "label",
                            "targetCount",
                            "targetId",
                            "targetIds",
                            "targetCategory",
                        ],
                    },
                },
                "interactions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "targetId": {"type": "string"},
                            "action": {"type": "string"},
                            "dialog": {"type": ["string", "null"]},
                            "duration": {"type": ["number", "null"]},
                        },
                        "required": ["targetId", "action", "dialog", "duration"],
                    },
                },
                "zones": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "id": {"type": "string"},
                            "label": {"type": ["string", "null"]},
                            "rect": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "x": {"type": "integer"},
                                    "y": {"type": "integer"},
                                    "w": {"type": "integer"},
                                    "h": {"type": "integer"},
                                },
                                "required": ["x", "y", "w", "h"],
                            },
                        },
                        "required": ["id", "label", "rect"],
                    },
                },
                "triggers": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "onEnterZones": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "id": {"type": "string"},
                                    "zoneId": {"type": "string"},
                                    "dialog": {"type": ["string", "null"]},
                                },
                                "required": ["id", "zoneId", "dialog"],
                            },
                        }
                    },
                    "required": ["onEnterZones"],
                },
                "dialog": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "entry": {"type": ["string", "null"]},
                        "startByTarget": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "targetId": {"type": "string"},
                                    "dialogId": {"type": "string"},
                                },
                                "required": ["targetId", "dialogId"],
                            },
                        },
                        "nodes": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "id": {"type": "string"},
                                    "speaker": {"type": ["string", "null"]},
                                    "text": {"type": "array", "items": {"type": "string"}},
                                    "choices": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "additionalProperties": False,
                                            "properties": {
                                                "text": {"type": "string"},
                                                "to": {"type": ["string", "null"]},
                                                "conditions": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object",
                                                        "additionalProperties": False,
                                                        "properties": {
                                                            "type": {"type": "string"},
                                                            "targetId": {"type": ["string", "null"]},
                                                            "key": {"type": ["string", "null"]},
                                                            "event": {"type": ["string", "null"]},
                                                            "flag": {"type": ["string", "null"]},
                                                            "scope": {"type": ["string", "null"]},
                                                            "op": {"type": ["string", "null"]},
                                                            "value": {
                                                                "type": [
                                                                    "string",
                                                                    "number",
                                                                    "boolean",
                                                                    "null",
                                                                    "array",
                                                                ],
                                                                "items": {
                                                                    "type": [
                                                                        "string",
                                                                        "number",
                                                                        "boolean",
                                                                        "null",
                                                                    ]
                                                                },
                                                            },
                                                        },
                                                        "required": [
                                                            "type",
                                                            "targetId",
                                                            "key",
                                                            "event",
                                                            "flag",
                                                            "scope",
                                                            "op",
                                                            "value",
                                                        ],
                                                    },
                                                },
                                                "setFlags": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object",
                                                        "additionalProperties": False,
                                                        "properties": {
                                                            "flag": {"type": "string"},
                                                            "scope": {"type": ["string", "null"]},
                                                            "value": {
                                                                "type": [
                                                                    "string",
                                                                    "number",
                                                                    "boolean",
                                                                    "null",
                                                                    "array",
                                                                ],
                                                                "items": {
                                                                    "type": [
                                                                        "string",
                                                                        "number",
                                                                        "boolean",
                                                                        "null",
                                                                    ]
                                                                },
                                                            },
                                                        },
                                                        "required": ["flag", "scope", "value"],
                                                    },
                                                },
                                                "setGlobalFlags": {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "object",
                                                        "additionalProperties": False,
                                                        "properties": {
                                                            "flag": {"type": "string"},
                                                            "scope": {"type": ["string", "null"]},
                                                            "value": {
                                                                "type": [
                                                                    "string",
                                                                    "number",
                                                                    "boolean",
                                                                    "null",
                                                                    "array",
                                                                ],
                                                                "items": {
                                                                    "type": [
                                                                        "string",
                                                                        "number",
                                                                        "boolean",
                                                                        "null",
                                                                    ]
                                                                },
                                                            },
                                                        },
                                                        "required": ["flag", "scope", "value"],
                                                    },
                                                },
                                            },
                                            "required": ["text", "to", "conditions", "setFlags", "setGlobalFlags"],
                                        },
                                    },
                                },
                                "required": ["id", "speaker", "text", "choices"],
                            },
                        },
                    },
                    "required": ["entry", "startByTarget", "nodes"],
                },
                "narrative": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "intro": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "text": {"type": "array", "items": {"type": "string"}},
                                "dialog": {"type": ["string", "null"]},
                            },
                            "required": ["text", "dialog"],
                        },
                        "outro": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "text": {"type": "array", "items": {"type": "string"}},
                                "dialog": {"type": ["string", "null"]},
                            },
                            "required": ["text", "dialog"],
                        },
                        "onEnterZones": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "zoneId": {"type": "string"},
                                    "text": {"type": "array", "items": {"type": "string"}},
                                    "dialog": {"type": ["string", "null"]},
                                },
                                "required": ["zoneId", "text", "dialog"],
                            },
                        },
                        "onInteract": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "targetId": {"type": "string"},
                                    "text": {"type": "array", "items": {"type": "string"}},
                                    "dialog": {"type": ["string", "null"]},
                                },
                                "required": ["targetId", "text", "dialog"],
                            },
                        },
                    },
                    "required": ["intro", "outro", "onEnterZones", "onInteract"],
                },
                "flags": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "local": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "flag": {"type": "string"},
                                    "value": {
                                        "type": [
                                            "string",
                                            "number",
                                            "boolean",
                                            "null",
                                            "array",
                                        ],
                                        "items": {
                                            "type": [
                                                "string",
                                                "number",
                                                "boolean",
                                                "null",
                                            ]
                                        },
                                    },
                                },
                                "required": ["flag", "value"],
                            },
                        },
                        "global": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "flag": {"type": "string"},
                                    "value": {
                                        "type": [
                                            "string",
                                            "number",
                                            "boolean",
                                            "null",
                                            "array",
                                        ],
                                        "items": {
                                            "type": [
                                                "string",
                                                "number",
                                                "boolean",
                                                "null",
                                            ]
                                        },
                                    },
                                },
                                "required": ["flag", "value"],
                            },
                        },
                    },
                    "required": ["local", "global"],
                },
                "checkpoints": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "id": {"type": "string"},
                            "label": {"type": ["string", "null"]},
                            "tx": {"type": ["integer", "null"]},
                            "ty": {"type": ["integer", "null"]},
                            "targetId": {"type": ["string", "null"]},
                        },
                        "required": ["id", "label", "tx", "ty", "targetId"],
                    },
                },
                "assetRequests": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "type": {"type": "string"},
                            "title": {"type": ["string", "null"]},
                            "slug": {"type": ["string", "null"]},
                            "prompt": {"type": "string"},
                            "variants": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["type", "title", "slug", "prompt", "variants"],
                    },
                },
            },
            "required": [
                "vibe",
                "seed",
                "title",
                "subtitle",
                "summary",
                "tileSize",
                "layout",
                "objectives",
                "interactions",
                "zones",
                "triggers",
                "dialog",
                "narrative",
                "flags",
                "checkpoints",
                "assetRequests",
            ],
        },
    }
