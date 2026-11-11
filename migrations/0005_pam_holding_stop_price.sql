-- Optional per-holding stop price for the 风险敞口 module. NULL means no stop is set; the browser then
-- estimates the stop from its default distance below the current price.
ALTER TABLE pam_holdings ADD COLUMN stop_price REAL;
