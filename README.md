# Apple Care

Shopify app scaffold for adding AppleCare as an optional paid cart and checkout item.

This initial scaffold intentionally includes only the installable Shopify app foundation:

- React Router Shopify app runtime
- Prisma session storage
- Shopify app proxy configuration
- Render-compatible Docker/start scripts

AppleCare pricing import, product mapping, cart logic, checkout behavior, and storefront UI are not implemented in this initial task.

## Deployment Pattern

Apple Care follows the same deployment pattern as the existing Shopify apps in this workspace:

- New Render Web Service running the Docker/Node app
- Shared Render PostgreSQL database attached through `DATABASE_URL`
- Prisma datasource provider `postgresql`
- Prisma session storage through `@shopify/shopify-app-session-storage-prisma`
- build command: `npm run build`
- runtime command: `npm run docker-start`

Configure PostgreSQL the same way as the existing apps: use the same shared Render PostgreSQL connection string as `DATABASE_URL` in the Apple Care Render Web Service environment. Do not commit the real connection string, database password, or copied Render internal URL to this repository.

Apple Care does not use a local-only database as its final setup. Any local PostgreSQL database used during development is only for testing. Production migrations run against the shared Render-provided `DATABASE_URL`.

The shared database uses the default Prisma `public` schema, matching the existing apps. Apple Care keeps its app-specific data isolated with clearly named tables, starting with `AppleCarePricing`. The copied base `20240530213853_create_session_table` migration matches the existing apps; on the shared database it should already be recorded in `_prisma_migrations`. The Apple Care pricing migration only creates the `AppleCarePricing` table and its unique index.

Required Render environment variables:

```text
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL=https://apple-care.onrender.com
SCOPES=read_products,write_products
DATABASE_URL
SHOP_CUSTOM_DOMAIN
LIVE_SHOP_DOMAIN
SESSION_SECRET
NODE_ENV=production
```

The `DATABASE_URL` value should come from Render PostgreSQL. Keep it out of source control and docs.

## Pricing Import

AppleCare pricing is stored in PostgreSQL through Prisma using `Decimal(12,4)` fields for the workbook prices.

```bash
npm run prisma:migrate
npm run import:pricing
```

The import reads `APPLE_CARE_PRICING_FILE` or accepts the workbook path as the first command argument.

For local import testing, set `APPLE_CARE_PRICING_FILE` in a private local `.env` or shell. Do not commit local file paths or database secrets.
