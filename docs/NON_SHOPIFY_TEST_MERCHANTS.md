# SFCC Test Merchants (Non-Shopify, Non-Global-e)

Reference list for SFCC parity development and regression testing.

## Selection Criteria

- Confirmed non-Shopify markers across sampled pages.
- Exclude Global-e-operated storefronts.
- Positive SFCC/Demandware/Commerce Cloud markers.
- Category diversity (footwear, apparel, beauty, accessories, sporting/outdoor).

## Validation Method (2026-05-19)

Each candidate was screened with automated fetch checks:

1. Homepage fetch with desktop user agent.
2. Additional same-domain page sampling where available (product/category/collection links).
3. Marker scan against sampled HTML:
   - SFCC-positive markers: `demandware`, `commercecloud`, `cdn.demandware`, `on/demandware.store`, `dwac`, `dw.shop`
   - Exclusion markers: `shopify`, `myshopify`, `cdn.shopify`, `global-e`, `globale`, `web-plugins.global-e`

This list is intended for active QA/development and should be re-checked before release demos.

## SFCC Priority Set (10)

1. Merrell
   - Seed URL: https://www.merrell.com/
   - Merchant type: outdoor footwear and apparel
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: footwear variants, promotions, policy depth

2. Saucony
   - Seed URL: https://www.saucony.com/
   - Merchant type: running footwear and apparel
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: size/color variant-heavy PDP patterns

3. Columbia Sportswear
   - Seed URL: https://www.columbia.com/
   - Merchant type: outdoor apparel and gear
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: broad taxonomy, shipping/policy coverage

4. Skechers
   - Seed URL: https://www.skechers.com/
   - Merchant type: footwear and apparel
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: high-volume PLP and option-heavy footwear PDPs

5. Bath & Body Works
   - Seed URL: https://www.bathandbodyworks.com/
   - Merchant type: beauty and personal care
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: promotions, bundles/GWP patterns, bot friction scenarios

6. Tommy Hilfiger (US)
   - Seed URL: https://usa.tommy.com/
   - Merchant type: apparel and accessories
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: apparel option matrices, localization and navigation complexity

7. Chaco
   - Seed URL: https://www.chacos.com/
   - Merchant type: outdoor footwear
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: footwear options with fit/size combinations

8. Johnston & Murphy
   - Seed URL: https://www.johnstonmurphy.com/
   - Merchant type: footwear and apparel
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: mixed catalog with footwear variant behavior

9. Wolverine
   - Seed URL: https://www.wolverine.com/
   - Merchant type: work/outdoor footwear
   - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
   - Why useful: robust footwear PDP patterns and cart interactions

10. CAT Footwear
    - Seed URL: https://www.catfootwear.com/
    - Merchant type: work/lifestyle footwear
    - Validation result: SFCC markers detected; Shopify/Global-e markers not detected
    - Why useful: option-selection edge cases and heavy product merchandising

## Excluded During SFCC Screening

- Foot Locker: Global-e marker detected.
- Vera Bradley: Shopify marker detected.
- Stride Rite: Shopify marker detected.
- Dr. Martens US: Global-e marker detected.
- Ariat: mixed markers included Shopify and Global-e.
