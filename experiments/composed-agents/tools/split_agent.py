"""Split one fleet agent file into its three layers, mechanically.
Paths below are relative to experiments/composed-agents; agents are read from the
repo's agents/ at git HEAD.

  python3 -I split_agent.py <agent-slug> <neurotype> <module-skill|-> <domain-name|-> ["<agent description>"]

  e.g. split_agent.py ndv-diagnose skeptical ndv-skeptical debugging "..."
  module "-": no published cognitive module for this neurotype yet
  domain "-": the agent is identity only (ndv-honest)

identity -> skills/ndv-neurotype-<x>/SKILL.md  intro (without "You are **Name**.") + Primordial
            Rule + Never Does. The published module (skills/<module-skill>) is
            only recorded in metadata; its text is not copied.
domain   -> skills/ndv-domain-<x>/SKILL.md     what the agent knows: protocols, checklists,
            laws, smells
agent    -> agents/<slug>.src.md                frontmatter, skills list, section
            layout, the name ("You are **Name**."), one @skill line per layer, and
            how the agent works with the fleet, verbatim: Out of Scope, Handoffs,
            Brief Contract, Self-Validation, Output Format, Parallelism, Pipeline

The skills name no other agent. Wherever the agent file names another agent
(slug or character), the skill says {{role}} instead, and compose.mjs fills it
from roles.json when it builds the agent. The agent's own name lives only in
the agent source: the identity layer says {{name}} and the domain layer says
"this agent". Nothing else in the text changes.
"""
import glob
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.normpath(os.path.join(HERE, '..'))   # experiments/composed-agents
ROOT = os.path.normpath(os.path.join(BASE, '..', '..'))
slug, neuro, module, dname = sys.argv[1:5]
adesc = sys.argv[5] if len(sys.argv) > 5 else ''
ident = 'ndv-neurotype-' + neuro
domain = None if dname == '-' else 'ndv-domain-' + dname
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


ROLE_OF = {agent: role for role, agent in json.load(open(os.path.join(BASE, 'roles.json'))).items()}
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


def roles(text, identity):
    masks = {}
    for i, ph in enumerate(PROTECT):
        masks[f'\x00{i}\x00'] = ph
        text = text.replace(ph, f'\x00{i}\x00')
    if identity:
        text = re.sub(rf"\b{character}\b", '{{name}}', text)
    else:
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
# How the agent works with the fleet: its I/O and handoffs. These stay in the agent
# file verbatim (it may name other agents); only domain knowledge goes to a skill.
CONTRACT = ('Out of Scope', 'Handoffs', 'Brief Contract', 'Self-Validation Protocol', 'Output Format',
            'Parallelism Strategy', 'Mandatory Pipeline')
is_contract = lambda p: not is_identity(p) and title(p).startswith(CONTRACT)
contract_secs = [p for p in rest if is_contract(p)]
domain_secs = [roles(p, False) for p in rest if not is_identity(p) and not is_contract(p)]
layout = [title(p) if is_contract(p) else roles(title(p), is_identity(p)) for p in rest]
NAME_LINE = f'You are **{character}**.'
assert intro.startswith(NAME_LINE + ' '), f'{slug}: intro does not open with {NAME_LINE}'
intro = roles(intro[len(NAME_LINE) + 1:], True)

nl = '\n\n'
persona = f'''---
name: {ident}
description: >
  Identity layer: the mind behind the {own_role} role. Loaded by name
  from an agent file or a brief's Load line, never by task matching. Also
  usable as a cognitive module in any workflow step.
user-invocable: false
metadata:
  type: neurotype
  layer: identity
  home-role: {own_role}
  related-module: {module}
---

{intro}

{nl.join(identity_secs)}
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
         + NAME_LINE + '\n' + ''.join(f'@skill {l}\n\n' for l in layers)
         + nl.join(contract_secs) + ('\n' if contract_secs else ''))

for name, text in ((ident, persona),) + (((domain, dom),) if domain else ()):
    os.makedirs(os.path.join(BASE, 'skills', name), exist_ok=True)
    open(os.path.join(BASE, 'skills', name, 'SKILL.md'), 'w').write(text)
open(os.path.join(BASE, 'agents', f'{slug}.src.md'), 'w').write(agent)
used = sorted(set(re.findall(r'\{\{([a-z-]+)\}\}', persona + (dom if domain else ''))) - {'name'})
print(f'{slug}: {character}, role {own_role}; refers to {len(used)} roles')
