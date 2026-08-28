-- Opt-in: Budget kann als wiederkehrender Planposten in die Prognose einfließen.
ALTER TABLE "Budget" ADD COLUMN "includeInForecast" BOOLEAN NOT NULL DEFAULT false;
