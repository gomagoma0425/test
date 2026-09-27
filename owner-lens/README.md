# Owner Lens — Rinnai example

Browser-only owner earnings, reinvestment, DCF and reverse-DCF calculator.

Open: https://gomagoma0425.github.io/test/owner-lens/

## Important correction (v1.1)

The previous 40% reinvestment rate and 10% incremental cash return were educational defaults, NOT estimates derived from Rinnai's disclosures. Both are now null in the initial dataset. DCF is withheld until the user supplies assumptions or explicitly chooses a labeled illustration.

The initial page offers a no-growth comparison, the previous 40%/10% illustration, and a clear-assumptions button. Other inputs, including maintenance CAPEX, remain assumptions where labeled. The previously displayed DCF of approximately JPY 2,815 was conditional on those assumptions and is not a company-specific fair-value conclusion.

## Use

1. Open the page. Rinnai's fixed-date input dataset is preloaded.
2. Enter growth reinvestment and cash-return assumptions, or select an illustration.
3. Import another company's JSON through Data/Sources. Copy or save the research prompt from the Prompt tab.
4. Save your inputs as JSON before closing. Forecast results can be exported as CSV.

All calculations and imported JSON processing run in the browser. There are no external libraries, analytics, automatic quote updates, or upload APIs. Opening the published page retrieves its static files from GitHub Pages. Market and financial values are dated, not live quotes.

## Model limits

Non-financial businesses with positive normalized owner earnings; self-funded growth, no forecast net borrowing, constant shares. The additional cash return is NOT accounting ROE/ROIC. Growth investment is deducted before discounting distributable cash at the cost of equity. Maintenance needs, working capital, minority interests, leases and non-operating assets require human review. Review the in-app sources and warnings before using results. Not a buy/sell recommendation.

## Files

- index.html — page layout
- style.css — responsive styles
- calculator.js — independent calculation and validation kernel
- defaults.js — dated example data, empty JSON template, research prompt
- app.js — interface, charts and import/export

The repository's existing root index.html is unchanged.
