import { useEffect, useState } from 'react'
import { postMessage } from '../hooks'
import { useSkillStore } from '../store'
import { useUIStore } from '../store'

// ---------------------------------------------------------------------------
// Top 5 popular skills (real content based on official repos)
// These are saved as SKILL.md files in ~/.claude/skills/ and recognized by
// the Claude Code CLI natively.
//
// Skills that depend on bundled helper scripts (webapp-testing,
// web-artifacts-builder) include a note telling the user how to install the
// full version via CLI for script support.
// ---------------------------------------------------------------------------

const POPULAR_SKILLS: {
  name: string
  description: string
  icon: string
  content: string
  source?: string
  cliInstall?: string
}[] = [
  {
    name: 'frontend-design',
    description: 'Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, or applications.',
    icon: '🎨',
    source: 'anthropics/claude-code (official)',
    content: `# Frontend Design

Create distinctive, production-grade frontend interfaces that prioritize high design quality and avoid generic AI aesthetics.

## Design Process

Before writing any code, establish a bold aesthetic direction. Whether brutalist, maximalist, minimalist, retro-futuristic, or another style — commit to it and execute with intentionality.

## Design Principles

### Typography
Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics. Pair a distinctive display font with a refined body font. Use Google Fonts or system font stacks for reliability.

### Color & Theme
Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Define a clear palette:
- Primary / accent color with strong contrast
- Surface colors for depth hierarchy
- Semantic colors for states (success, warning, error)

### Motion & Animation
Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.

### Spatial Composition
Unexpected layouts. Asymmetry. Overlap. Break the grid intentionally. Use negative space as a design element, not just padding.

### Atmospheric Details
Add contextual visual details — subtle gradients, noise textures, shadows with personality, border treatments that reinforce the theme.

## What to Avoid
- Generic purple gradients and uniform rounded corners
- Overused font families (Inter, Arial, Roboto defaults)
- Cookie-cutter layouts with predictable symmetry
- Designs that lack context-specific character
- Excessive centered layouts with identical spacing

## Complexity Matching
Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.`,
  },
  {
    name: 'skill-creator',
    description: 'Interactive skill creation wizard. Use when the user wants to create, build, or design a new Claude skill or SKILL.md file.',
    icon: '🛠️',
    source: 'anthropics/skills (official)',
    content: `# Skill Creator

Help users create well-structured Claude skills through an interactive process.

## Process

### Step 1: Understand the Goal
Ask the user what their skill should do:
- What problem does it solve?
- When should Claude use it? (triggers)
- What inputs does it need?
- What should the output look like?

### Step 2: Generate SKILL.md
Create a valid SKILL.md file with:

\`\`\`yaml
---
name: skill-identifier
description: When to trigger and what it does
---
\`\`\`

**Frontmatter rules:**
- \`name\`: lowercase letters, numbers, and hyphens only (max 64 chars)
- \`description\`: clear trigger conditions + purpose (max 1024 chars)
- Make descriptions "pushy" — specify when Claude should use the skill

### Step 3: Write Instructions
The markdown body should include:
1. **Purpose** — brief description
2. **Process** — step-by-step methodology
3. **Anti-patterns** — what NOT to do
4. **Examples** — concrete examples showing the skill in action
5. **Verification** — how to verify the skill was applied correctly

### Step 4: Save & Test
Save the file to \`~/.claude/skills/<name>.md\` and test by typing \`/<name>\` in Claude Code.

## Best Practices
- Keep under 500 lines for optimal performance
- Use clear section headers for scanability
- Include concrete examples, not just abstract rules
- Write actionable instructions, not descriptions
- Reference bundled scripts/resources when needed`,
  },
  {
    name: 'superpowers',
    description: 'Software development methodology: brainstorm -> plan -> execute. Use when the user needs structured development workflow, TDD, debugging, or project planning.',
    icon: '🦸',
    source: 'obra/superpowers (community top)',
    cliInstall: 'claude plugin add obra/superpowers',
    content: `# Superpowers - Software Development Methodology

A structured software development methodology for coding agents. Provides the brainstorm -> plan -> execute workflow.

## Core Workflow

### /brainstorm
When starting a new feature or solving a complex problem:
1. Explore the problem space — don't jump to solutions
2. Consider multiple approaches (at least 3)
3. Evaluate trade-offs for each approach
4. Identify risks, dependencies, and unknowns
5. Produce a ranked list of options with rationale
6. Let the user decide before proceeding

### /write-plan
After brainstorming, create a detailed implementation plan:
1. Break the chosen approach into discrete, testable steps
2. Order steps to minimize risk (high-risk items first)
3. Identify files to create/modify for each step
4. Define success criteria for each step
5. Estimate relative complexity
6. Include rollback strategy for risky steps
7. Save the plan as a structured document

### /execute-plan
Execute a plan step by step:
1. Read the plan document
2. Execute one step at a time
3. Verify success criteria after each step
4. Commit working state frequently
5. Update the plan with actual outcomes
6. Stop and re-plan if a step fails unexpectedly

## Development Principles

### Test-Driven Development (TDD)
1. Write a failing test first
2. Write minimal code to pass the test
3. Refactor while keeping tests green
4. Never skip the red-green-refactor cycle

### Debugging Methodology
1. Reproduce the bug with a minimal test case
2. Form a hypothesis about root cause
3. Add targeted logging or assertions to verify
4. Fix the root cause, not symptoms
5. Add a regression test before fixing
6. Verify the fix doesn't break other tests

### Code Review Mindset
- Read the diff, not just the final code
- Check for unintended side effects
- Verify error handling and edge cases
- Ensure tests cover the changes
- Look for security implications

## Anti-Patterns to Avoid
- Jumping to implementation without understanding the problem
- Making multiple changes at once without testing between them
- Fixing symptoms instead of root causes
- Skipping tests for "simple" changes
- Ignoring failing tests and moving forward`,
  },
  {
    name: 'web-artifacts-builder',
    description: 'Suite of tools for creating elaborate, multi-component HTML artifacts using React, Tailwind CSS, and shadcn/ui. Use for complex artifacts requiring state management, routing, or shadcn/ui components.',
    icon: '🏗️',
    source: 'anthropics/skills (official)',
    cliInstall: 'claude plugin add anthropics/skills --skill web-artifacts-builder',
    content: `# Web Artifacts Builder

Build powerful frontend artifacts with React + TypeScript + Tailwind CSS + shadcn/ui.

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS 3.4 with shadcn/ui theming
- 40+ shadcn/ui components pre-installed
- Parcel for single-file bundling

## Design Guidelines

IMPORTANT: Avoid "AI slop" — no excessive centered layouts, purple gradients, uniform rounded corners, and Inter font. Create distinctive, visually interesting interfaces.

## Development Process

### Step 1: Initialize Project
\`\`\`bash
npx create-vite@latest <project-name> --template react-ts
cd <project-name>
npm install
npx shadcn@latest init
\`\`\`

### Step 2: Develop
- Use shadcn/ui components: https://ui.shadcn.com/docs/components
- Organize with path aliases (\`@/\`)
- Use Tailwind for styling, CSS variables for theming
- Structure: components/, hooks/, lib/, types/

### Step 3: Key Patterns

**State Management:**
\`\`\`tsx
const [state, setState] = useState(initialState)
// For complex state, use useReducer
const [state, dispatch] = useReducer(reducer, initialState)
\`\`\`

**Component Structure:**
\`\`\`tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function MyComponent() {
  return (
    <Card>
      <CardHeader><CardTitle>Title</CardTitle></CardHeader>
      <CardContent>Content</CardContent>
    </Card>
  )
}
\`\`\`

### Step 4: Bundle to Single HTML
\`\`\`bash
npx parcel build index.html --no-source-maps
npx html-inline dist/index.html -o bundle.html
\`\`\`

## Best Practices
- Use semantic HTML elements
- Ensure responsive layouts (mobile-first)
- Add keyboard navigation and ARIA attributes
- Test in both light and dark themes
- Keep bundle size reasonable (code-split if needed)`,
  },
  {
    name: 'webapp-testing',
    description: 'Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.',
    icon: '🧪',
    source: 'anthropics/skills (official)',
    cliInstall: 'claude plugin add anthropics/skills --skill webapp-testing',
    content: `# Web Application Testing

Test local web applications using Python Playwright scripts.

## Decision Tree

\`\`\`
User task -> Is it static HTML?
    Yes -> Read HTML file directly to identify selectors
           -> Write Playwright script using selectors
    No (dynamic webapp) -> Is the server already running?
        No  -> Start the server first, then run Playwright
        Yes -> Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
\`\`\`

## Basic Test Script

\`\`\`python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')  # CRITICAL: Wait for JS

    # Take screenshot for visual verification
    page.screenshot(path='/tmp/test-screenshot.png', full_page=True)

    # Inspect DOM
    content = page.content()
    buttons = page.locator('button').all()

    # Interact with elements
    page.click('text=Submit')
    page.fill('input[name="email"]', 'test@example.com')

    # Assert results
    assert page.locator('.success-message').is_visible()

    browser.close()
\`\`\`

## With Server Management

\`\`\`bash
# Single server
python scripts/with_server.py --server "npm run dev" --port 5173 -- python test.py

# Multiple servers (backend + frontend)
python scripts/with_server.py \\
  --server "cd backend && python server.py" --port 3000 \\
  --server "cd frontend && npm run dev" --port 5173 \\
  -- python test.py
\`\`\`

## Reconnaissance Pattern

1. **Inspect rendered DOM:**
   \`\`\`python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   \`\`\`

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfalls
- Don't inspect DOM before waiting for \`networkidle\` on dynamic apps
- Always close the browser when done
- Use descriptive selectors: \`text=\`, \`role=\`, CSS selectors, or IDs
- Add appropriate waits: \`page.wait_for_selector()\`

## Prerequisites
\`\`\`bash
pip install playwright
playwright install chromium
\`\`\``,
  },
]

export function SkillsPanel() {
  const show = useUIStore((s) => s.showSkillsModal)
  const setShow = useUIStore((s) => s.setShowSkillsModal)
  const { skills, editingSkill } = useSkillStore()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (show) postMessage({ type: 'loadSkills' })
  }, [show])

  useEffect(() => {
    if (editingSkill && skills[editingSkill]) {
      const skill = skills[editingSkill]
      setName(skill.name)
      setDescription(skill.description)
      setContent(skill.content)
      setShowForm(true)
    }
  }, [editingSkill, skills])

  const resetForm = () => {
    setName('')
    setDescription('')
    setContent('')
    setShowForm(false)
    useSkillStore.getState().setEditingSkill(null)
  }

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return
    postMessage({ type: 'saveSkill', name: name.trim(), description: description.trim(), content: content.trim() })
    resetForm()
  }

  const handleDelete = (skillName: string) => {
    postMessage({ type: 'deleteSkill', name: skillName })
  }

  const handleQuickAdd = (skill: (typeof POPULAR_SKILLS)[number]) => {
    if (skill.name in skills) return
    postMessage({ type: 'saveSkill', name: skill.name, description: skill.description, content: skill.content })
  }

  const handleClose = () => {
    setShow(false)
    resetForm()
  }

  if (!show) return null

  const skillEntries = Object.entries(skills)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    fontSize: '13px',
    fontFamily: 'var(--vscode-font-family)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '520px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>Skills</span>
            <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: '8px' }}>
              ~/.claude/skills/
            </span>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--vscode-foreground)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              opacity: 0.6,
            }}
          >
            {'✕'}
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Installed skills */}
          {skillEntries.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {skillEntries.map(([sName, skill]) => (
                <div
                  key={sName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '8px',
                    backgroundColor: 'rgba(128, 128, 128, 0.04)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                      /{sName}
                    </div>
                    {skill.description && (
                      <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', opacity: 0.8, marginBottom: '4px' }}>
                        {skill.description}
                      </div>
                    )}
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--vscode-descriptionForeground)',
                      opacity: 0.5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {skill.content.substring(0, 80)}{skill.content.length > 80 ? '...' : ''}
                    </div>
                  </div>
                  <div className="flex gap-1.5" style={{ flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      onClick={() => useSkillStore.getState().setEditingSkill(sName)}
                      className="cursor-pointer"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--vscode-foreground)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                        e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(sName)}
                      className="cursor-pointer"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {skillEntries.length === 0 && !showForm && (
            <div style={{
              textAlign: 'center',
              padding: '20px',
              opacity: 0.5,
              fontSize: '12px',
              marginBottom: '12px',
            }}>
              No skills installed. Add a skill or choose from popular ones below.
            </div>
          )}

          {/* Add skill button */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full cursor-pointer"
              style={{
                padding: '10px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--chatui-accent)',
                border: '1px dashed var(--chatui-accent)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                transition: 'all 0.2s ease',
                marginBottom: '20px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              + Create Skill
            </button>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <div
              style={{
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '20px',
                backgroundColor: 'rgba(128, 128, 128, 0.04)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '14px', opacity: 0.8 }}>
                {editingSkill ? `Edit: ${editingSkill}` : 'New Skill'}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                  Name (becomes /slash-command)
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-skill"
                  disabled={!!editingSkill}
                  style={{ ...inputStyle, opacity: editingSkill ? 0.5 : 1 }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                  Description
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this skill does..."
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                  Instructions (Markdown)
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Detailed instructions for Claude when this skill is invoked..."
                  rows={6}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    minHeight: '100px',
                    fontFamily: 'var(--vscode-editor-font-family)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  onClick={resetForm}
                  className="cursor-pointer"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: '1px solid var(--vscode-panel-border)',
                    color: 'inherit',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!name.trim() || !content.trim()}
                  className="cursor-pointer"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    opacity: name.trim() && content.trim() ? 1 : 0.5,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { if (name.trim() && content.trim()) e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--vscode-button-background)' }}
                >
                  {editingSkill ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Popular skills */}
          {POPULAR_SKILLS.filter((s) => !(s.name in skills)).length > 0 && (
            <div
              style={{
                paddingTop: '16px',
                borderTop: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', opacity: 0.7 }}>
                Popular Skills
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {POPULAR_SKILLS.filter((s) => !(s.name in skills)).map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => handleQuickAdd(skill)}
                    className="text-left cursor-pointer border-none text-inherit"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-md)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span style={{ fontSize: '16px', minWidth: '24px', textAlign: 'center' }}>
                      {skill.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 500, fontSize: '12px' }}>/{skill.name}</span>
                        {skill.source && (
                          <span style={{
                            fontSize: '9px',
                            opacity: 0.4,
                            padding: '1px 4px',
                            borderRadius: '3px',
                            border: '1px solid var(--vscode-panel-border)',
                          }}>
                            {skill.source}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '1px' }}>
                        {skill.description.length > 80 ? skill.description.substring(0, 80) + '...' : skill.description}
                      </div>
                      {skill.cliInstall && (
                        <div style={{
                          fontSize: '9px',
                          opacity: 0.35,
                          marginTop: '2px',
                          fontFamily: 'var(--vscode-editor-font-family)',
                        }}>
                          Full version: {skill.cliInstall}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--chatui-accent)', fontWeight: 500, opacity: 0.7 }}>
                      + Add
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Usage hint */}
          <div style={{
            marginTop: '16px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            fontSize: '11px',
            opacity: 0.8,
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>How Skills Work</div>
            <div>Skills are saved as <code style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '3px', backgroundColor: 'rgba(128,128,128,0.15)' }}>SKILL.md</code> files in <code style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '3px', backgroundColor: 'rgba(128,128,128,0.15)' }}>~/.claude/skills/</code>. Claude Code CLI loads them automatically at startup. Type <code style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '3px', backgroundColor: 'rgba(128,128,128,0.15)' }}>/skill-name</code> to invoke, or Claude will use them when relevant.</div>
            <div style={{ marginTop: '4px', opacity: 0.7 }}>
              Some skills have bundled scripts — see the "Full version" CLI command for complete installs.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
