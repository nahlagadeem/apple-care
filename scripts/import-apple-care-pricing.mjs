import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { PrismaClient, Prisma } from "@prisma/client";
import xlsx from "xlsx";

const { readFile: readWorkbook, utils } = xlsx;

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSeedPath = path.resolve(
  __dirname,
  "../prisma/apple-care-pricing.seed.json",
);

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDecimal(value, fieldName, rowNumber) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing ${fieldName} at row ${rowNumber}`);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${fieldName} at row ${rowNumber}: ${value}`);
  }

  if (numeric < 0) {
    throw new Error(`Invalid negative ${fieldName} at row ${rowNumber}: ${value}`);
  }

  return new Prisma.Decimal(numeric.toFixed(4));
}

function normalizeSeedDecimal(value, fieldName, rowNumber) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing ${fieldName} at seed row ${rowNumber}`);
  }

  const decimal = new Prisma.Decimal(value);
  if (decimal.isNegative()) {
    throw new Error(`Invalid negative ${fieldName} at seed row ${rowNumber}: ${value}`);
  }

  return decimal.toDecimalPlaces(4);
}

function getCell(row, columnIndex) {
  return row[columnIndex];
}

function readPricingRows(filePath) {
  const workbook = readWorkbook(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook does not contain any sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const header = rows[0] || [];
  const columnByHeader = new Map(
    header.map((value, index) => [normalizeHeader(value), index]),
  );

  const requiredColumns = {
    partNumber: "part#",
    description: "discription",
    sell: "sell",
    sellWithVat: "sell with vat",
  };

  for (const label of Object.values(requiredColumns)) {
    if (!columnByHeader.has(label)) {
      throw new Error(`Missing required Excel column: ${label}`);
    }
  }

  return rows
    .slice(1)
    .map((row, index) => {
      const rowNumber = index + 2;
      const partNumber = String(
        getCell(row, columnByHeader.get(requiredColumns.partNumber)),
      ).trim();
      const description = String(
        getCell(row, columnByHeader.get(requiredColumns.description)),
      ).trim();

      if (!partNumber && !description) return null;
      if (!partNumber) throw new Error(`Missing Part# at row ${rowNumber}`);
      if (!description) throw new Error(`Missing Discription at row ${rowNumber}`);

      return {
        partNumber,
        description,
        sell: normalizeDecimal(
          getCell(row, columnByHeader.get(requiredColumns.sell)),
          "Sell",
          rowNumber,
        ),
        sellWithVat: normalizeDecimal(
          getCell(row, columnByHeader.get(requiredColumns.sellWithVat)),
          "Sell with Vat",
          rowNumber,
        ),
      };
    })
    .filter(Boolean);
}

async function readSeedRows(seedPath) {
  const contents = await readFile(seedPath, "utf8");
  const seedRows = JSON.parse(contents);

  if (!Array.isArray(seedRows)) {
    throw new Error("Pricing seed must contain an array of rows.");
  }

  return seedRows.map((row, index) => {
    const rowNumber = index + 1;
    const partNumber = String(row.partNumber || "").trim();
    const description = String(row.description || "").trim();

    if (!partNumber) throw new Error(`Missing partNumber at seed row ${rowNumber}`);
    if (!description) throw new Error(`Missing description at seed row ${rowNumber}`);

    return {
      partNumber,
      description,
      sell: normalizeSeedDecimal(row.sell, "sell", rowNumber),
      sellWithVat: normalizeSeedDecimal(row.sellWithVat, "sellWithVat", rowNumber),
    };
  });
}

function getImportSource() {
  const rawFilePath = process.argv[2] || process.env.APPLE_CARE_PRICING_FILE;
  if (rawFilePath) {
    return {
      type: "excel",
      path: path.resolve(rawFilePath),
    };
  }

  return {
    type: "seed",
    path: defaultSeedPath,
  };
}

async function main() {
  const source = getImportSource();
  const pricingRows =
    source.type === "excel"
      ? readPricingRows(source.path)
      : await readSeedRows(source.path);

  let upserted = 0;
  for (const row of pricingRows) {
    await prisma.appleCarePricing.upsert({
      where: { partNumber: row.partNumber },
      update: {
        description: row.description,
        sell: row.sell,
        sellWithVat: row.sellWithVat,
      },
      create: row,
    });
    upserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceType: source.type,
        sourcePath: source.path,
        rowsRead: pricingRows.length,
        rowsUpserted: upserted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
