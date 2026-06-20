const project = (key: string) => ({
  root: `/projects/${key}`,
  issues: {
    list: `/projects/${key}/issues`,
    detail: (number: number) => `/projects/${key}/issues/${number}`,
  },
  board: `/projects/${key}/board`,
  backlog: `/projects/${key}/backlog`,
  gantt: `/projects/${key}/gantt`,
  timeReport: `/projects/${key}/time-report`,
  knowledgeBase: {
    list: `/projects/${key}/knowledge-base`,
    article: (slug: string) => `/projects/${key}/knowledge-base/${slug}`,
  },
  settings: {
    root: `/projects/${key}/settings`,
    members: `/projects/${key}/settings/members`,
    tags: `/projects/${key}/settings/tags`,
    workflows: `/projects/${key}/settings/workflows`,
    workflowRules: `/projects/${key}/settings/workflow-rules`,
    customFields: `/projects/${key}/settings/custom-fields`,
    webhooks: `/projects/${key}/settings/webhooks`,
    integrations: `/projects/${key}/settings/integrations`,
    autoAssign: `/projects/${key}/settings/auto-assign`,
    teams: `/projects/${key}/settings/teams`,
    versions: `/projects/${key}/settings/versions`,
  },
});

export const routes = {
  dashboard: '/dashboard',
  projects: '/projects',
  project,

  search: (query?: string) => (query ? `/search?q=${encodeURIComponent(query)}` : '/search'),

  profile: '/profile',

  notifications: {
    list: '/notifications',
    preferences: '/notifications/preferences',
  },

  myIssues: '/my-issues',
  myTimeReport: '/my-time-report',

  admin: {
    root: '/admin',
    users: {
      list: '/admin/users',
      detail: (id: string) => `/admin/users/${id}`,
    },
    roles: '/admin/roles',
    sso: '/admin/sso',
    system: '/admin/system',
  },

  login: (opts?: { redirect?: string; error?: string }) => {
    if (!opts) return '/login';
    const params = new URLSearchParams();
    if (opts.redirect) params.set('redirect', opts.redirect);
    if (opts.error) params.set('error', opts.error);
    const qs = params.toString();
    return qs ? `/login?${qs}` : '/login';
  },
} as const;
