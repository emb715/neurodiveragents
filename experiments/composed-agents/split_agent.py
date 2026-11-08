"""Split one fleet agent file into its three layers, mechanically.

  python3 -I split_agent.py <agent-slug> <neurotype> <module-skill|-> <domain-name|-> ["<domain description>"]

  e.g. split_agent.py ndv-diagnose skeptical ndv-skeptical debugging "..."
  module "-": no published module yet, the neurotype skill has no workflow-only part
  domain "-": the agent is identity only (ndv-honest)

identity -> skills/ndv-neurotype-<module>/SKILL.md  intro + Primordial Rule + Never Does,
            verbatim; then, below a workflow-only marker, the published module's
            text (skills/<module-skill>, left untouched) for use outside the agent
domain   -> skills/ndv-domain-<name>/SKILL.md       every other section except
            Self-Validation, plus the domain soundness checks. Character names are
            neutralised: own character -> "this agent", other characters -> slug.
protocol -> <slug>.src.md (this folder)              frontmatter + skills + @skill
            lines + the shared Self-Validation skeleton

Only two kinds of text change: the soundness-check pointer, and character names
in the domain layer. Everything else moves verbatim.
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
ddesc = sys.argv[5] if len(sys.argv) > 5 else ''
ident = 'ndv-neurotype-' + neuro
domain = None if dname == '-' else 'ndv-domain-' + dname
WORKFLOW_ONLY = '<!-- ndv:workflow-only -->'

SELF_VALIDATION = '''## Self-Validation Protocol

Before doing any work, run two checks against the received brief:

**1. Completeness check** — verify every Brief Contract field is present and specific enough to act on. If any field is missing or too vague: emit `BRIEF_REJECTED: [field] — [what is needed]` and sentinel.

**2. Domain soundness check** — run the Domain Soundness Checks against what was described.

If both checks pass: proceed. Do not start work until both pass.
One re-brief from Flow is allowed. On second rejection, Flow escalates to the human.'''


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


# character name -> agent slug, across the fleet
CHARS = {}
for f in glob.glob(os.path.join(ROOT, 'agents', 'ndv-*.md')):
    m = re.search(r'You are \*\*(\w+)\*\*', open(f).read())
    if m:
        CHARS[m.group(1)] = os.path.basename(f)[:-3]

src = head(f'agents/{slug}.md')
open(os.path.join(HERE, f'{slug}.original.md'), 'w').write(src)
fm, body = re.match(r'---\n(.*?)\n---\n(.*)', src, re.S).groups()
parts = sections(body)
intro, rest = parts[0], parts[1:]
title = lambda p: p.split('\n')[0][3:].strip()
character = re.search(r'You are \*\*(\w+)\*\*', intro).group(1)


# Fixed phrases where a character name is an ordinary word; never rewritten.
PROTECT = ['Signal-to-noise', 'signal-to-noise', 'Edge case', 'Boy Scout', 'Complexity Signal']
# Names that are not ordinary English words: safe to rewrite to the slug anywhere.
DISTINCT = {'Pierce', 'Acute', 'Ward', 'Lux', 'Pixel', 'Datum', 'Pulse', 'Delta', 'Arc', 'Craft', 'Scout'}


def neutral(text):
    masks = {}
    for i, ph in enumerate(PROTECT):
        key = f'\x00{i}\x00'
        masks[key] = ph
        text = text.replace(ph, key)
    text = re.sub(rf"\b{character}'s\b", "this agent's", text)
    text = re.sub(rf"\b{character}\b", 'this agent', text)
    for name, other in CHARS.items():
        if name == character:
            continue
        text = re.sub(rf"\b{name}'s\b", f"{other}'s", text)
        if name in DISTINCT:
            text = re.sub(rf"\b{name}\b", other, text)
    for key, ph in masks.items():
        text = text.replace(key, ph)
    # "`ndv-x` (Name)" became "`ndv-x` (ndv-x)": keep the slug once
    return re.sub(r'`(ndv-[a-z-]+)` \(\1\)', r'`\1`', text)


identity_secs = [p for p in rest if title(p) in ('Primordial Rule', f'What {character} Never Does')]
sv = next((p for p in rest if title(p) == 'Self-Validation Protocol'), None)
domain_secs = [neutral(p) for p in rest if p not in identity_secs]
sound = None and neutral(sv.split('**2. Domain soundness check**')[1].split('\n\nIf both checks pass')[0].split('\n', 1)[1].strip()) if sv else None

module_text = head(f'skills/{module}/SKILL.md').split('---\n', 2)[2].strip() if module != '-' else None
nl = '\n\n'
persona = f'''---
name: {ident}
description: >
  Identity layer: {character}'s mind (source agent {slug}). Loaded by name
  from an agent file or a brief's Load line, never by task matching. Also
  usable as a cognitive module in any workflow step.
user-invocable: false
metadata:
  type: neurotype
  layer: identity
  origin: agent-derived
  source-agent: {slug}
  character: {character}
  module: {module}
---

{intro}

{nl.join(identity_secs)}
'''
if module_text:
    persona += f'''
{WORKFLOW_ONLY}

## Cognitive Core

The same mind outside its home domain. When this skill is loaded into a step that is not {slug}'s usual work, apply this:

{module_text}
'''

dom = f'''---
name: {domain}
description: >
  {ddesc}
user-invocable: false
metadata:
  type: domain
  layer: domain
  source-agent: {slug}
  pairs-with: {ident}
---

{nl.join(domain_secs)}
'''
if sound:
    dom += f'''
## Domain Soundness Checks

Run these as check 2 of the Self-Validation Protocol:

{sound}
'''

layers = [ident] + ([domain] if domain else [])
layout = '<!-- ndv:layout ' + json.dumps([title(p) if p in identity_secs else neutral(title(p)) for p in rest]) + ' -->\n\n'
agent = '---\n' + fm + '\nskills:\n' + ''.join(f'  - {l}\n' for l in layers) + '---\n\n' + layout + ''.join(f'@skill {l}\n\n' for l in layers) 

for name, text in ((ident, persona),) + (((domain, dom),) if domain else ()):
    os.makedirs(os.path.join(ROOT, 'skills', name), exist_ok=True)
    open(os.path.join(ROOT, 'skills', name, 'SKILL.md'), 'w').write(text)
open(os.path.join(HERE, f'{slug}.src.md'), 'w').write(agent)
left = [n for n in DISTINCT | {character} if domain and re.search(rf'\b{n}\b', dom.split('---', 2)[2])]
print(f'{slug}: {ident} + {domain}; character {character}; capitalised names left in domain: {left or "none"}')
