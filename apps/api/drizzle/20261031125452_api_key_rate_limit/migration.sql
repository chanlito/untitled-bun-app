ALTER TABLE "api_keys" ALTER COLUMN "rate_limit_time_window" SET DEFAULT 60000;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "rate_limit_max" SET DEFAULT 600;