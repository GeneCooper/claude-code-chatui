import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../shared/logger';

const log = createModuleLogger('ProjectProfiler');

// ============================================================================
// Types
// ============================================================================

export interface ProjectProfile {
  primaryLanguage: string;
  framework: string | null;
  testFramework: string | null;
  buildTool: string | null;
  packageManager: string | null;
  detectedLibraries: string[];
  monorepo: boolean;
  workspaceRoot: string;
  detectedAt: number;
}

// ============================================================================
// Framework Prompt Templates
// ============================================================================

const FRAMEWORK_PROMPTS: Record<string, string> = {
  'react-typescript': `[Project Profile: React + TypeScript]
- Use functional components with hooks. Prefer strict TypeScript (avoid \`any\`).
- Use named exports for components. Keep components under 200 lines.
- Follow existing state management patterns ({stateLib}).
- Follow existing styling patterns ({styleLib}).
- Test: run \`{testCommand}\` after changes. Build: run \`{buildCommand}\` to verify compilation.
- Avoid: class components, type assertions, unnecessary re-renders, inline styles when utility classes exist.`,

  'react-javascript': `[Project Profile: React + JavaScript]
- Use functional components with hooks. Use PropTypes or JSDoc for type safety.
- Use named exports. Keep components focused and under 200 lines.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: class components, direct DOM manipulation, inline styles when CSS modules exist.`,

  'next-typescript': `[Project Profile: Next.js + TypeScript]
- Use App Router patterns (app/ directory) when present, else Pages Router.
- Prefer Server Components by default; add 'use client' only when needed.
- Use Next.js built-in components: Image, Link, Font instead of HTML equivalents.
- API routes: app/api/ (App Router) or pages/api/ (Pages Router).
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: unnecessary 'use client', direct fetch in client components when server actions work.`,

  'vue-typescript': `[Project Profile: Vue + TypeScript]
- Use Composition API with \`<script setup>\` syntax.
- Use TypeScript with defineProps/defineEmits for type-safe component interfaces.
- Follow single-file component convention (.vue files).
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: Options API in new code, mixins (use composables instead).`,

  'vue-javascript': `[Project Profile: Vue + JavaScript]
- Use Composition API with \`<script setup>\` syntax.
- Follow single-file component convention (.vue files).
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: Options API in new code, mixins (use composables instead).`,

  'angular-typescript': `[Project Profile: Angular + TypeScript]
- Follow Angular CLI conventions: components, services, modules.
- Use standalone components when possible.
- Use RxJS observables for async data; prefer async pipe in templates.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: any type, direct DOM access, manual subscriptions without cleanup.`,

  'svelte-typescript': `[Project Profile: Svelte + TypeScript]
- Use Svelte 5 runes ($state, $derived, $effect) when available, else Svelte 4 stores.
- Keep components small and composable.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.`,

  'express-typescript': `[Project Profile: Express + TypeScript]
- Use typed request/response handlers. Define interfaces for request bodies and params.
- Use middleware for cross-cutting concerns (auth, validation, error handling).
- Structure: routes → controllers → services → repositories.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: logic in route handlers, untyped request bodies.`,

  'express-javascript': `[Project Profile: Express + JavaScript]
- Use middleware for cross-cutting concerns (auth, validation, error handling).
- Structure: routes → controllers → services.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.`,

  'django-python': `[Project Profile: Django + Python]
- Follow Django conventions: models, views, serializers, URLs.
- Use class-based views for CRUD, function views for simple endpoints.
- Use Django ORM; avoid raw SQL unless necessary for performance.
- Test: run \`{testCommand}\`. Manage: run \`python manage.py\` for migrations, etc.
- Avoid: fat views (move logic to services/models), N+1 queries.`,

  'fastapi-python': `[Project Profile: FastAPI + Python]
- Use Pydantic models for request/response validation.
- Use dependency injection for shared logic (db sessions, auth).
- Use async/await for I/O-bound operations.
- Test: run \`{testCommand}\`.
- Avoid: synchronous I/O in async handlers, untyped endpoints.`,

  'flask-python': `[Project Profile: Flask + Python]
- Use blueprints for route organization.
- Use Flask extensions for common patterns (Flask-SQLAlchemy, Flask-Login).
- Test: run \`{testCommand}\`.`,

  'typescript': `[Project Profile: TypeScript]
- Use strict TypeScript. Define interfaces for data shapes.
- Prefer named exports. Use const assertions where appropriate.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.
- Avoid: any, type assertions, non-null assertions unless absolutely necessary.`,

  'javascript': `[Project Profile: JavaScript]
- Use ES modules (import/export). Use JSDoc for type documentation.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.`,

  'python': `[Project Profile: Python]
- Follow PEP 8 style guidelines. Use type hints (Python 3.10+ syntax preferred).
- Use virtual environments. Requirements in pyproject.toml or requirements.txt.
- Test: run \`{testCommand}\`.
- Avoid: global state, mutable default arguments, bare except clauses.`,

  'go': `[Project Profile: Go]
- Follow Go conventions: short variable names, error wrapping, interface-based design.
- Use go modules. Organize code by domain, not by type.
- Test: run \`go test ./...\`. Build: run \`go build ./...\`.
- Avoid: init() functions, package-level variables, deep nesting.`,

  'rust': `[Project Profile: Rust]
- Use idiomatic Rust: Result/Option for error handling, traits for abstraction.
- Follow clippy recommendations. Use derive macros where appropriate.
- Test: run \`cargo test\`. Build: run \`cargo build\`.
- Avoid: unwrap() in production code, unnecessary cloning, unsafe blocks.`,

  'java': `[Project Profile: Java]
- Follow Java conventions: packages, classes, interfaces.
- Use modern Java features (records, sealed classes, pattern matching) when available.
- Test: run \`{testCommand}\`. Build: run \`{buildCommand}\`.`,
};

// ============================================================================
// Notable libraries to detect and mention
// ============================================================================

const NOTABLE_LIBS: Record<string, string> = {
  // State management
  zustand: 'zustand (state management)',
  redux: 'Redux (state management)',
  '@reduxjs/toolkit': 'Redux Toolkit (state management)',
  mobx: 'MobX (state management)',
  jotai: 'Jotai (state management)',
  recoil: 'Recoil (state management)',
  pinia: 'Pinia (state management)',
  vuex: 'Vuex (state management)',

  // Styling
  tailwindcss: 'Tailwind CSS',
  'styled-components': 'styled-components',
  '@emotion/react': 'Emotion',
  sass: 'Sass/SCSS',

  // Data fetching
  axios: 'axios (HTTP)',
  '@tanstack/react-query': 'TanStack Query',
  swr: 'SWR (data fetching)',
  'apollo-client': 'Apollo GraphQL',
  '@apollo/client': 'Apollo GraphQL',

  // ORM / DB
  prisma: 'Prisma ORM',
  '@prisma/client': 'Prisma ORM',
  drizzle: 'Drizzle ORM',
  typeorm: 'TypeORM',
  mongoose: 'Mongoose (MongoDB)',
  sequelize: 'Sequelize ORM',

  // Validation
  zod: 'Zod (validation)',
  yup: 'Yup (validation)',
  joi: 'Joi (validation)',

  // Testing extras
  '@testing-library/react': 'React Testing Library',
  playwright: 'Playwright (E2E)',
  '@playwright/test': 'Playwright (E2E)',
  cypress: 'Cypress (E2E)',
};

// ============================================================================
// ProjectProfiler
// ============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ProjectProfiler implements vscode.Disposable {
  private _cache = new Map<string, ProjectProfile>();
  private _watchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    this._setupFileWatchers();
  }

  detectProfile(workspaceRoot: string): ProjectProfile {
    // Check cache
    const cached = this._cache.get(workspaceRoot);
    if (cached && Date.now() - cached.detectedAt < CACHE_TTL_MS) {
      return cached;
    }

    const profile = this._detect(workspaceRoot);
    this._cache.set(workspaceRoot, profile);
    return profile;
  }

  getSystemPromptSection(workspaceRoot: string): string | null {
    const profile = this.detectProfile(workspaceRoot);
    if (profile.primaryLanguage === 'unknown') return null;

    // Find matching template
    const keys = [
      profile.framework ? `${profile.framework}-${profile.primaryLanguage}` : null,
      profile.primaryLanguage,
    ].filter(Boolean) as string[];

    let template: string | null = null;
    for (const key of keys) {
      if (FRAMEWORK_PROMPTS[key]) {
        template = FRAMEWORK_PROMPTS[key];
        break;
      }
    }

    if (!template) return null;

    // Fill placeholders
    const testCommand = this._getTestCommand(profile);
    const buildCommand = this._getBuildCommand(profile);
    const pm = profile.packageManager || 'npm';

    let result = template
      .replace(/\{testCommand\}/g, testCommand)
      .replace(/\{buildCommand\}/g, buildCommand)
      .replace(/\{packageManager\}/g, pm);

    // Fill state/style library placeholders
    const stateLib = profile.detectedLibraries.find((l) =>
      ['zustand', 'redux', 'mobx', 'jotai', 'recoil', 'pinia', 'vuex'].some((s) => l.includes(s))
    );
    const styleLib = profile.detectedLibraries.find((l) =>
      ['tailwindcss', 'styled-components', '@emotion', 'sass'].some((s) => l.includes(s))
    );

    result = result
      .replace(/\{stateLib\}/g, stateLib ? NOTABLE_LIBS[stateLib] || stateLib : 'project conventions')
      .replace(/\{styleLib\}/g, styleLib ? NOTABLE_LIBS[styleLib] || styleLib : 'project conventions');

    // Append detected notable libraries
    const notableDetected = profile.detectedLibraries
      .filter((lib) => NOTABLE_LIBS[lib])
      .map((lib) => NOTABLE_LIBS[lib]);

    if (notableDetected.length > 0) {
      result += `\n- Detected libraries: ${notableDetected.join(', ')}.`;
    }

    return result;
  }

  getDetectedLibraries(workspaceRoot: string): string[] {
    return this.detectProfile(workspaceRoot).detectedLibraries;
  }

  dispose(): void {
    this._watchers.forEach((w) => w.dispose());
    this._watchers = [];
    this._cache.clear();
  }

  // ============================================================================
  // Private
  // ============================================================================

  private _setupFileWatchers(): void {
    const patterns = ['**/package.json', '**/go.mod', '**/Cargo.toml', '**/pyproject.toml', '**/requirements.txt', '**/pom.xml'];
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => this._cache.clear());
      watcher.onDidCreate(() => this._cache.clear());
      watcher.onDidDelete(() => this._cache.clear());
      this._watchers.push(watcher);
    }
  }

  private _detect(workspaceRoot: string): ProjectProfile {
    const profile: ProjectProfile = {
      primaryLanguage: 'unknown',
      framework: null,
      testFramework: null,
      buildTool: null,
      packageManager: null,
      detectedLibraries: [],
      monorepo: false,
      workspaceRoot,
      detectedAt: Date.now(),
    };

    try {
      // Check Node.js / JavaScript / TypeScript project
      const pkgPath = path.join(workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        this._detectFromPackageJson(pkgPath, workspaceRoot, profile);
        return profile;
      }

      // Check Python project
      const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
      const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
      const setupPyPath = path.join(workspaceRoot, 'setup.py');
      if (fs.existsSync(pyprojectPath) || fs.existsSync(requirementsPath) || fs.existsSync(setupPyPath)) {
        this._detectPython(workspaceRoot, profile);
        return profile;
      }

      // Check Go project
      const goModPath = path.join(workspaceRoot, 'go.mod');
      if (fs.existsSync(goModPath)) {
        profile.primaryLanguage = 'go';
        profile.buildTool = 'go';
        profile.testFramework = 'go-test';
        profile.packageManager = 'go';
        return profile;
      }

      // Check Rust project
      const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
      if (fs.existsSync(cargoPath)) {
        profile.primaryLanguage = 'rust';
        profile.buildTool = 'cargo';
        profile.testFramework = 'cargo-test';
        profile.packageManager = 'cargo';
        return profile;
      }

      // Check Java project
      const pomPath = path.join(workspaceRoot, 'pom.xml');
      const gradlePath = path.join(workspaceRoot, 'build.gradle');
      const gradleKtsPath = path.join(workspaceRoot, 'build.gradle.kts');
      if (fs.existsSync(pomPath)) {
        profile.primaryLanguage = 'java';
        profile.buildTool = 'maven';
        profile.testFramework = 'junit';
        profile.packageManager = 'maven';
        return profile;
      }
      if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
        profile.primaryLanguage = 'java';
        profile.buildTool = 'gradle';
        profile.testFramework = 'junit';
        profile.packageManager = 'gradle';
        return profile;
      }
    } catch (err) {
      log.warn('Project detection failed', { error: String(err) });
    }

    return profile;
  }

  private _detectFromPackageJson(pkgPath: string, workspaceRoot: string, profile: ProjectProfile): void {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8').substring(0, 100_000); // cap at 100KB
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
        workspaces?: unknown;
      };

      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      const allDeps = { ...deps, ...devDeps };
      const allKeys = Object.keys(allDeps);

      // Language: TypeScript if typescript in devDeps
      profile.primaryLanguage = allDeps.typescript ? 'typescript' : 'javascript';

      // Framework detection (order matters: more specific first)
      if (deps.next || devDeps.next) profile.framework = 'next';
      else if (deps.nuxt || devDeps.nuxt) profile.framework = 'nuxt';
      else if (deps['@angular/core']) profile.framework = 'angular';
      else if (deps.svelte || devDeps.svelte) profile.framework = 'svelte';
      else if (deps.react) profile.framework = 'react';
      else if (deps.vue) profile.framework = 'vue';
      else if (deps.express) profile.framework = 'express';
      else if (deps.fastify) profile.framework = 'express'; // treat as express-like
      else if (deps.koa) profile.framework = 'express';

      // Test framework
      if (allDeps.vitest) profile.testFramework = 'vitest';
      else if (allDeps.jest || allDeps['@jest/core']) profile.testFramework = 'jest';
      else if (allDeps.mocha) profile.testFramework = 'mocha';
      else if (allDeps['@playwright/test'] || allDeps.playwright) profile.testFramework = 'playwright';
      else if (allDeps.cypress) profile.testFramework = 'cypress';

      // Build tool
      if (allDeps.vite) profile.buildTool = 'vite';
      else if (allDeps.webpack) profile.buildTool = 'webpack';
      else if (allDeps.esbuild) profile.buildTool = 'esbuild';
      else if (allDeps.rollup) profile.buildTool = 'rollup';
      else if (allDeps.turbo || allDeps.turborepo) profile.buildTool = 'turbo';

      // Package manager (check lock files)
      if (fs.existsSync(path.join(workspaceRoot, 'bun.lockb')) || fs.existsSync(path.join(workspaceRoot, 'bun.lock'))) {
        profile.packageManager = 'bun';
      } else if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) {
        profile.packageManager = 'pnpm';
      } else if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) {
        profile.packageManager = 'yarn';
      } else {
        profile.packageManager = 'npm';
      }

      // Monorepo detection
      if (pkg.workspaces || fs.existsSync(path.join(workspaceRoot, 'lerna.json')) ||
          fs.existsSync(path.join(workspaceRoot, 'nx.json')) ||
          fs.existsSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'))) {
        profile.monorepo = true;
      }

      // Collect notable libraries
      profile.detectedLibraries = allKeys.filter((k) => k in NOTABLE_LIBS || k in deps).slice(0, 30);
    } catch (err) {
      log.warn('Failed to parse package.json', { error: String(err) });
    }
  }

  private _detectPython(workspaceRoot: string, profile: ProjectProfile): void {
    profile.primaryLanguage = 'python';
    profile.packageManager = 'pip';

    // Read requirements.txt or pyproject.toml for framework detection
    const deps: string[] = [];

    try {
      const reqPath = path.join(workspaceRoot, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf8');
        const lines = content.split('\n').map((l) => l.trim().toLowerCase().split(/[>=<\[]/)[0]);
        deps.push(...lines.filter(Boolean));
      }
    } catch { /* ignore */ }

    try {
      const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
      if (fs.existsSync(pyprojectPath)) {
        const content = fs.readFileSync(pyprojectPath, 'utf8');
        // Simple TOML parsing: look for dependency names in [tool.poetry.dependencies] or [project.dependencies]
        const depMatches = content.match(/(?:dependencies\s*=\s*\[([^\]]*)\])/gs);
        if (depMatches) {
          for (const block of depMatches) {
            const names = block.match(/"([a-zA-Z0-9_-]+)"/g);
            if (names) deps.push(...names.map((n) => n.replace(/"/g, '').toLowerCase()));
          }
        }
        // Also check for poetry
        if (content.includes('[tool.poetry]')) {
          profile.packageManager = 'poetry';
        }
      }
    } catch { /* ignore */ }

    // Framework detection
    if (deps.includes('django')) profile.framework = 'django';
    else if (deps.includes('fastapi')) profile.framework = 'fastapi';
    else if (deps.includes('flask')) profile.framework = 'flask';

    // Test framework
    if (deps.includes('pytest')) profile.testFramework = 'pytest';
    else if (fs.existsSync(path.join(workspaceRoot, 'pytest.ini')) || fs.existsSync(path.join(workspaceRoot, 'pyproject.toml'))) {
      profile.testFramework = 'pytest'; // common default
    }

    profile.detectedLibraries = deps.slice(0, 20);
  }

  private _getTestCommand(profile: ProjectProfile): string {
    switch (profile.testFramework) {
      case 'vitest': return `${profile.packageManager === 'bun' ? 'bun' : 'npx'} vitest`;
      case 'jest': return `${profile.packageManager === 'bun' ? 'bun' : 'npx'} jest`;
      case 'mocha': return 'npx mocha';
      case 'pytest': return 'pytest';
      case 'go-test': return 'go test ./...';
      case 'cargo-test': return 'cargo test';
      case 'playwright': return 'npx playwright test';
      case 'cypress': return 'npx cypress run';
      case 'junit': return profile.buildTool === 'gradle' ? './gradlew test' : 'mvn test';
      default: return `${profile.packageManager || 'npm'} test`;
    }
  }

  private _getBuildCommand(profile: ProjectProfile): string {
    switch (profile.buildTool) {
      case 'vite': return `${profile.packageManager || 'npm'} run build`;
      case 'webpack': return `${profile.packageManager || 'npm'} run build`;
      case 'esbuild': return `${profile.packageManager || 'npm'} run build`;
      case 'turbo': return 'npx turbo build';
      case 'cargo': return 'cargo build';
      case 'go': return 'go build ./...';
      case 'maven': return 'mvn package';
      case 'gradle': return './gradlew build';
      default: return `${profile.packageManager || 'npm'} run build`;
    }
  }
}
