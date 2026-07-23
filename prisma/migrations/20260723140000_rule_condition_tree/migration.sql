-- Regeln: von starren Spalten (field/pattern/amountOp/amountValue) auf einen
-- verschachtelten Bedingungs-Baum (JSON) umstellen. Bestehende Regeln werden
-- verlustfrei in einen Wurzel-UND-Knoten überführt.

ALTER TABLE "Rule" ADD COLUMN "conditions" JSONB;

UPDATE "Rule" SET "conditions" = jsonb_build_object(
  'type', 'group',
  'op', 'AND',
  'children',
    (CASE
       WHEN "pattern" IS NOT NULL AND btrim("pattern") <> ''
       THEN jsonb_build_array(jsonb_build_object(
              'type', 'text',
              'field', "field"::text,
              'op', 'CONTAINS',
              'value', "pattern"))
       ELSE '[]'::jsonb
     END)
    ||
    (CASE
       WHEN "amountOp" IS NOT NULL AND "amountValue" IS NOT NULL
       THEN jsonb_build_array(jsonb_build_object(
              'type', 'amount',
              'field', 'AMOUNT',
              'op', "amountOp"::text,
              'value', "amountValue"))
       ELSE '[]'::jsonb
     END)
);

ALTER TABLE "Rule" DROP COLUMN "field";
ALTER TABLE "Rule" DROP COLUMN "pattern";
ALTER TABLE "Rule" DROP COLUMN "amountOp";
ALTER TABLE "Rule" DROP COLUMN "amountValue";

DROP TYPE "RuleField";
DROP TYPE "RuleAmountOp";
