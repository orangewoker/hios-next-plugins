---
name: blender-modeling
description: Create, inspect, refine, modify, render, and save detailed Blender models from text and reference images through the Blender MCP server.
license: MIT
allowed-tools: [mcp:blender-mcp.server:*]
metadata:
  hios:
    version: "0.1.0"
    surfaces: [agent]
    intent: blender
    execution-mode: tool-required
    requires-mcp: [blender-mcp.server]
---

# Blender Modeling

Use inspect_scene before modifying an existing file. Generate complete Blender Python with semantic objects, real metric scale, materials, bevels, joinery, and visible detail, then call execute_script. The tool saves and validates a real .blend file. Use render_preview when a new preview is needed. Never claim completion unless the tool returns a validated blendPath.

