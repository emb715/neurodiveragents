"""Split one fleet agent file into its three layers, mechanically.

  python3 -I split_agent.py <agent-slug> <neurotype> <module-skill|-> <domain-name|-> ["<agent description>"]

  e.g. split_agent.py ndv-diagnose skeptical ndv-skeptical debugging "..."
  module "-": no published module yet, the neurotype skill has no workflow-only part
  domain "-": the agent is identity only (ndv-honest)

identity -> skills/ndv-neurotype-<x>/SKILL.md  intro + Primordial Rule + Never Does;
            then, below a workflow-only marker, the published module's text
            (skills/<module-skill>, left untouched) for use outside the agent
domain   -> skills/ndv-domain-<x>/SKILL.md     every other section, Self-Validation included
agent    -> <slug>.src.md (this folder)         frontmatter, skills list, section
            layout and one @skill line per layer

The skills name no other agent. Wherever the agent file names another agent
(slug or character), the skill says {{role}} instead, and compose.mjs fills it
from roles.json when it builds the agent. The agent's own character name stays
in the identity layer (it is the persona) and becomes "this agent" in the
domain layer. Nothing else in the text changes.
"""
import glob
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
slug, neuro, module, dname = sys.argv[1:5]
adesc = sys.argv[5] if len(sys.argv) > 5 else ''
ident = 'ndv-neurotype-' + neuro
domain = None if dname == '-' else 'ndv-domain-' + dname
WORKFLOW_ONLY = '<!-- ndv:workflow-only -->'
# Fixed phrases where a character name is an ordinary word; never rewritten.
PROTECT = ['| Signal |', '### Flow', 'Signal-to-noise', 'signal-to-noise', 'Edge case', 'Boy Scout', 'Complexity Signal']


def sections(body):
    out, cur, fence = [], [], False
    for line in body.split('\n'):
        if line.startswith('```'):
            fence = not fence
        if line.startswith('## ') and not fence and cur:
            out.append('\n'.join(cur).strip())
            cur = []
        cur.append(line)
    out.append('\n'.join(cur).strip())
    return out


def head(name):
    return subprocess.run(['git', '-C', ROOT, 'show', f'HEAD:{name}'], capture_output=True, text=True, check=True).stdout


ROLE_OF = {agent: role for role, agent in json.load(open(os.path.join(HERE, 'roles.json'))).items()}
CHARS = {}  # character name -> agent slug, across the fleet
for f in sorted(glob.glob(os.path.join(ROOT, 'agents', 'ndv-*.md'))):
    m = re.search(r'You are \*\*(\w+)\*\*', open(f).read())
    if m:
        CHARS[m.group(1)] = os.path.basename(f)[:-3]

src = head(f'agents/{slug}.md')
fm, body = re.match(r'---\n(.*?)\n---\n(.*)', src, re.S).groups()
intro, *rest = sections(body)
title = lambda p: p.split('\n')[0][3:].strip()
character = re.search(r'You are \*\*(\w+)\*\*', intro).group(1)
own_role = ROLE_OF[slug]


def roles(text, keep_own_name):
    masks = {}
    for i, ph in enumerate(PROTECT):
        masks[f'\x00{i}\x00'] = ph
        text = text.replace(ph, f'\x00{i}\x00')
    if not keep_own_name:
        text = re.sub(rf"\b{character}'s\b", "this agent's", text)
        text = re.sub(rf"\b{character}\b", 'this agent', text)
    for name, other in CHARS.items():
        if name != character:
            text = re.sub(rf'\b{name}\b', '{{' + ROLE_OF[other] + '}}', text)
    text = re.sub(r'(?<![\w-])ndv-[a-z]+(?:-[a-z]+)*(?![\w-])',
                  lambda m: '{{' + ROLE_OF[m.group(0)] + '}}' if m.group(0) in ROLE_OF else m.group(0), text)
    for key, ph in masks.items():
        text = text.replace(key, ph)
    # "`ndv-x` (Name)" became "`{{r}}` ({{r}})": keep it once
    return re.sub(r'`(\{\{[a-z-]+\}\})` \(\1\)', r'`\1`', text)


is_identity = lambda p: title(p) in ('Primordial Rule', f'What {character} Never Does')
identity_secs = [roles(p, True) for p in rest if is_identity(p)]
domain_secs = [roles(p, False) for p in rest if not is_identity(p)]
layout = [roles(title(p), is_identity(p)) for p in rest]
intro = roles(intro, True)

nl = '\n\n'
persona = f'''---
name: {ident}
description: >
  Identity layer: {character}'s mind, the {own_role} role. Loaded by name
  from an agent file or a brief's Load line, never by task matching. Also
  usable as a cognitive module in any workflow step.
user-invocable: false
metadata:
  type: neurotype
  layer: identity
  role: {own_role}
  character: {character}
  module: {module}
---

{intro}

{nl.join(identity_secs)}
'''
if module != '-':
    module_text = head(f'skills/{module}/SKILL.md').split('---\n', 2)[2].strip()
    persona += f'''
{WORKFLOW_ONLY}

## Cognitive Core

The same mind outside its home domain. When this skill is loaded into a step outside the {own_role} role, apply this:

{module_text}
'''

dom = f'''---
name: {domain}
description: >
  Domain layer: {own_role}. Load it when an agent file or a brief's Load line
  names it. {roles(adesc.strip(), False)}
user-invocable: false
metadata:
  type: domain
  layer: domain
  role: {own_role}
  pairs-with: {ident}
---

{nl.join(domain_secs)}
'''

layers = [ident] + ([domain] if domain else [])
agent = ('---\n' + fm + '\nskills:\n' + ''.join(f'  - {l}\n' for l in layers) + '---\n\n'
         + '<!-- ndv:layout ' + json.dumps(layout) + ' -->\n\n'
         + ''.join(f'@skill {l}\n\n' for l in layers))

for name, text in ((ident, persona),) + (((domain, dom),) if domain else ()):
    os.makedirs(os.path.join(ROOT, 'skills', name), exist_ok=True)
    open(os.path.join(ROOT, 'skills', name, 'SKILL.md'), 'w').write(text)
open(os.path.join(HERE, f'{slug}.src.md'), 'w').write(agent)
used = sorted(set(re.findall(r'\{\{([a-z-]+)\}\}', persona.split(WORKFLOW_ONLY)[0] + (dom if domain else ''))))
print(f'{slug}: {character}, role {own_role}; refers to {len(used)} roles')
