# Apple Care

Shopify app scaffold for adding AppleCare as an optional paid cart and checkout item.

This initial scaffold intentionally includes only the installable Shopify app foundation:

- React Router Shopify app runtime
- Prisma session storage
- Shopify app proxy configuration
- Render-compatible Docker/start scripts

AppleCare pricing import, product mapping, cart logic, checkout behavior, and storefront UI are not implemented in this initial task.

## Pricing Import

AppleCare pricing is stored in PostgreSQL through Prisma using `Decimal(12,4)` fields for the workbook prices.

```bash
npm run prisma:migrate
npm run import:pricing
```

The import reads `APPLE_CARE_PRICING_FILE` when set, otherwise it uses the local workbook path from the project setup.
