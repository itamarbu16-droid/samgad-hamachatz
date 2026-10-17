# Independent Romach workspace

This branch retains the task application's functionality with Battalion 75 branding and the motto כרומח חד אל תוך אדמת אויב. No records, accounts, tokens or user grants are copied from the source deployment.

Connect a fresh dedicated Postgres database through the hosting provider, then redeploy. The build runs db:bootstrap, which refuses a database containing another organization before applying migrations. Until the database is connected, the login branding is available for review and account activation/task storage remain unavailable.

The intended owner is configured privately through WORKSPACE_OWNER_EMAIL. The owner chooses an application password with a one-time activation link. OWNER_ACTIVATION_TOKEN and BETTER_AUTH_SECRET belong in protected deployment settings and must never be committed. Activation creates only the owner and an empty workspace. It sends no email. Public signup is disabled. Configure BETTER_AUTH_URL to this deployment's canonical origin, WORKSPACE_ORGANIZATION_ID to its isolated organization, and DEMO_MODE=false.

The emblem comes from the supplied artwork. App metadata, manifests, push icons, splash, login and dashboards use the new branding. Real calendar OAuth and email delivery require separate credentials; nothing is reused from the original workspace.
