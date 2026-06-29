# Apple Care

Shopify app scaffold for adding AppleCare as an optional paid cart and checkout item.

This initial scaffold includes the installable Shopify app foundation and pricing data storage:

- React Router Shopify app runtime
- Prisma session storage
- Shopify app proxy configuration
- Render-compatible Docker/start scripts
- AppleCare pricing Prisma model and migration
- Committed AppleCare pricing seed file
- Admin pricing page at `/app/pricing`
- Admin main variant to AppleCare Shopify variant mapping page at `/app/mappings`

Storefront UI, cart logic, and checkout behavior are not implemented yet.

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
SHOPIFY_APP_URL=https://apple-care-m216.onrender.com
SCOPES=read_products,write_products
DATABASE_URL
SHOP_CUSTOM_DOMAIN
LIVE_SHOP_DOMAIN
SESSION_SECRET
NODE_ENV=production
```

The `DATABASE_URL` value should come from Render PostgreSQL. Keep it out of source control and docs.

## Pricing Import

AppleCare pricing seed data is stored in PostgreSQL through Prisma using `Decimal(12,4)` fields for the workbook prices. This table is kept for audit/reference only. Checkout price calculation must use the mapped Shopify AppleCare product variant price as the source of truth.

```bash
npm run prisma:migrate
npm run import:pricing
```

On Render, run the production seed import with:

```bash
npm run import:pricing
```

The command defaults to the committed non-secret seed file at `prisma/apple-care-pricing.seed.json`, so it does not need the Desktop Excel file in production. The import uses `partNumber` upserts, so re-running the command updates the same 13 rows and does not create duplicates.

For local Excel import testing, set `APPLE_CARE_PRICING_FILE` in a private local `.env` or shell, or pass the workbook path as the first command argument. Do not commit local file paths or database secrets.

`npm run import:pricing:seed` is kept as an alias for the same seed-backed importer, but the Render command is `npm run import:pricing`.

## Product Mappings

AppleCare product mappings are managed at `/app/mappings` inside the embedded Shopify app.

Mappings use Shopify variant ID as the key because cart lines and future checkout behavior are variant-based. This also supports products where different variants need different AppleCare options.

The first mapping UI uses manual Shopify product and variant entry. Each mapping connects one main Shopify variant to one AppleCare Shopify variant. `AppleCarePricing` is not required for checkout mapping and must not be used for checkout price calculation.

The mapped AppleCare Shopify variant price is the checkout source of truth. `appleCarePriceSnapshot` is optional reference data for admin review only.

The database and server action enforce one active AppleCare mapping per shop and main Shopify variant.

The `/app/mappings` page includes an approved product-pair seed action. It clears the current mappings for the shop and reseeds the nine approved product pairs provided for this store. The manual mapping editor remains in place for review and exceptions.

AppleCare variant price remains the checkout source of truth. The approved seed action stores the mapped AppleCare product/variant IDs, titles, SKUs, and a price snapshot for reference.

## Storefront Lookup API

The storefront should call the app proxy endpoint:

```text
/apps/apple-care/lookup?variantId=<numeric_id_or_gid>
```

Accepted `variantId` formats:

- `1234567890`
- `gid://shopify/ProductVariant/1234567890`

The endpoint validates the Shopify app-proxy signature, resolves the current shop from the proxy request, and returns the active AppleCare mapping for the selected main Shopify variant.

Example responses:

```json
{ "ok": true, "hasAppleCare": true, "appleCare": { "productId": "...", "productTitle": "...", "variantId": "...", "variantTitle": "...", "sku": "...", "price": "839.16" } }
```

```json
{ "ok": true, "hasAppleCare": false }
```

Theme JavaScript can fetch this endpoint directly through the configured app proxy without Shopify admin auth.

## Storefront Product Add-on Block

The product-page add-on is delivered as a theme app extension block in `extensions/apple-care-addon`.

To enable it in Shopify:

1. Open the theme editor.
2. Open a product template.
3. Add the `Apple Care Add-on` app block.
4. Place it under the product details or accordion area.

The block reads the currently selected product variant from the product form, calls the lookup API, shows the AppleCare card only when a mapping exists, and updates when the variant changes. Cart and checkout behavior are not wired yet.
