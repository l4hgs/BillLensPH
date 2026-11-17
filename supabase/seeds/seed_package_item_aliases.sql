-- ==============================================================================
-- BillLens PH: Package item aliases (matcher terms)
-- Requires migration 003 and seed_philhealth_packages.sql.
--
-- Each alias is a short term a hospital would print on an itemized line for a
-- supply/service already bundled in the case rate. Matching is whole-word and
-- case-insensitive; a trailing plural "s"/"es" is allowed.
--
-- Rules of thumb when adding aliases:
--   * Prefer the specific supply ("trocar", "dialyzer") over generic words.
--   * Never add words like "standard", "surgical", "routine", "basic", "fee".
--   * Professional fees are never flagged as bundled, so no PF aliases.
--
-- Idempotent: safe to re-run.
-- ==============================================================================

INSERT INTO public.package_item_aliases (package_id, alias, kind)
SELECT p.id, v.alias, v.kind
FROM (
  VALUES
    -- 47562 Laparoscopic Cholecystectomy
    ('47562', 'trocar', 'token'),
    ('47562', 'laparoscopic cannula', 'token'),
    ('47562', 'co2 insufflation', 'token'),
    ('47562', 'insufflation', 'token'),
    ('47562', 'endoclip', 'token'),
    ('47562', 'endoscopic clip', 'token'),
    ('47562', 'titanium clip', 'token'),
    ('47562', 'clip applier', 'token'),
    ('47562', 'drape pack', 'token'),
    ('47562', 'surgical drape', 'token'),
    ('47562', 'surgical gown', 'token'),
    ('47562', 'suture', 'token'),
    ('47562', 'skin closure', 'token'),
    ('47562', 'pacu', 'token'),
    ('47562', 'recovery room', 'token'),
    ('47562', 'lactated ringer', 'token'),

    -- 47600 Open Cholecystectomy
    ('47600', 'laparotomy tray', 'token'),
    ('47600', 'laparotomy pad', 'token'),
    ('47600', 'retractor', 'token'),
    ('47600', 'suction tubing', 'token'),
    ('47600', 'suture', 'token'),
    ('47600', 'vicryl', 'token'),
    ('47600', 'chromic', 'token'),
    ('47600', 'jackson pratt', 'token'),
    ('47600', 'penrose', 'token'),
    ('47600', 'surgical drain', 'token'),
    ('47600', 'cefazolin', 'token'),
    ('47600', 'pacu', 'token'),

    -- 44970 Laparoscopic Appendectomy
    ('44970', 'trocar', 'token'),
    ('44970', 'endoloop', 'token'),
    ('44970', 'endoscopic clip', 'token'),
    ('44970', 'co2 insufflation', 'token'),
    ('44970', 'insufflation', 'token'),
    ('44970', 'laparoscopic grasper', 'token'),
    ('44970', 'laparoscopic dissector', 'token'),
    ('44970', 'surgical drape', 'token'),
    ('44970', 'cefazolin', 'token'),
    ('44970', 'pacu', 'token'),
    ('44970', 'recovery room', 'token'),

    -- 44950 Appendectomy (Open)
    ('44950', 'appendectomy set', 'token'),
    ('44950', 'surgical drape', 'token'),
    ('44950', 'retractor', 'token'),
    ('44950', 'suture', 'token'),
    ('44950', 'surgical gauze', 'token'),
    ('44950', 'laparotomy pad', 'token'),
    ('44950', 'scalpel blade', 'token'),
    ('44950', 'pacu', 'token'),

    -- 93458 Coronary Angiography
    ('93458', 'introducer sheath', 'token'),
    ('93458', 'sheath', 'token'),
    ('93458', 'judkins', 'token'),
    ('93458', 'pigtail catheter', 'token'),
    ('93458', 'diagnostic catheter', 'token'),
    ('93458', 'guidewire', 'token'),
    ('93458', 'contrast media', 'token'),
    ('93458', 'iohexol', 'token'),
    ('93458', 'iopamidol', 'token'),
    ('93458', 'heparin', 'token'),
    ('93458', 'manifold', 'token'),
    ('93458', 'pressure line', 'token'),
    ('93458', 'compression device', 'token'),
    ('93458', 'tr band', 'token'),

    -- 92920 PCI / Angioplasty
    ('92920', 'guiding catheter', 'token'),
    ('92920', 'guidewire', 'token'),
    ('92920', 'ptca', 'token'),
    ('92920', 'balloon catheter', 'token'),
    ('92920', 'inflation device', 'token'),
    ('92920', 'indeflator', 'token'),
    ('92920', 'introducer sheath', 'token'),
    ('92920', 'contrast media', 'token'),
    ('92920', 'iohexol', 'token'),
    ('92920', 'nitroglycerin', 'token'),
    ('92920', 'heparin', 'token'),
    ('92920', 'act test', 'token'),
    ('92920', 'closure dressing', 'token'),

    -- 59400 Normal Spontaneous Delivery
    ('59400', 'delivery room', 'token'),
    ('59400', 'delivery pack', 'token'),
    ('59400', 'episiotomy', 'token'),
    ('59400', 'lidocaine', 'token'),
    ('59400', 'oxytocin', 'token'),
    ('59400', 'cord clamp', 'token'),
    ('59400', 'suction bulb', 'token'),
    ('59400', 'vitamin k', 'token'),
    ('59400', 'erythromycin eye', 'token'),
    ('59400', 'hygiene kit', 'token'),

    -- 59510 Cesarean Section
    ('59510', 'spinal anesthesia tray', 'token'),
    ('59510', 'spinal needle', 'token'),
    ('59510', 'bupivacaine', 'token'),
    ('59510', 'laparotomy drape', 'token'),
    ('59510', 'suture', 'token'),
    ('59510', 'oxytocin', 'token'),
    ('59510', 'methylergometrine', 'token'),
    ('59510', 'pacu', 'token'),

    -- 90935 Hemodialysis
    ('90935', 'dialyzer', 'token'),
    ('90935', 'dialysate', 'token'),
    ('90935', 'blood tubing', 'token'),
    ('90935', 'tubing line', 'token'),
    ('90935', 'fistula needle', 'token'),
    ('90935', 'avf needle', 'token'),
    ('90935', 'heparin', 'token'),
    ('90935', 'saline flush', 'token'),

    -- J18.9 CAP Moderate Risk
    ('J18.9', 'chest x ray', 'token'),
    ('J18.9', 'chest xray', 'token'),
    ('J18.9', 'cbc', 'token'),
    ('J18.9', 'urinalysis', 'token'),
    ('J18.9', 'sputum', 'token'),
    ('J18.9', 'ceftriaxone', 'token'),
    ('J18.9', 'ampicillin', 'token'),
    ('J18.9', 'iv cannula', 'token'),
    ('J18.9', 'infusion set', 'token'),
    ('J18.9', 'oxygen', 'token'),
    ('J18.9', 'salbutamol', 'token'),
    ('J18.9', 'ipratropium', 'token'),
    ('J18.9', 'nebulization', 'token'),

    -- J18.0 CAP High Risk
    ('J18.0', 'arterial blood gas', 'token'),
    ('J18.0', 'abg', 'token'),
    ('J18.0', 'serum electrolytes', 'token'),
    ('J18.0', 'blood culture', 'token'),
    ('J18.0', 'chest x ray', 'token'),
    ('J18.0', 'infusion set', 'token'),
    ('J18.0', 'microdrip', 'token'),
    ('J18.0', 'high flow oxygen', 'token'),

    -- A97.1 Dengue with Warning Signs
    ('A97.1', 'cbc', 'token'),
    ('A97.1', 'hematocrit', 'token'),
    ('A97.1', 'platelet count', 'token'),
    ('A97.1', 'ns1', 'token'),
    ('A97.1', 'dengue igm', 'token'),
    ('A97.1', 'iv cannula', 'token'),
    ('A97.1', 'stopcock', 'token'),
    ('A97.1', 'extension tubing', 'token'),
    ('A97.1', 'oral rehydration', 'token'),
    ('A97.1', 'paracetamol', 'token'),

    -- A09.9 Acute Gastroenteritis
    ('A09.9', 'fecalysis', 'token'),
    ('A09.9', 'urinalysis', 'token'),
    ('A09.9', 'normosol', 'token'),
    ('A09.9', 'infusion set', 'token'),
    ('A09.9', 'oral rehydration', 'token'),
    ('A09.9', 'zinc', 'token'),

    -- 58150 Total Abdominal Hysterectomy
    ('58150', 'retractor', 'token'),
    ('58150', 'surgical drape', 'token'),
    ('58150', 'suture', 'token'),
    ('58150', 'vicryl', 'token'),
    ('58150', 'electrocautery', 'token'),
    ('58150', 'grounding pad', 'token'),
    ('58150', 'laparotomy sponge', 'token'),
    ('58150', 'foley catheter', 'token'),
    ('58150', 'urine bag', 'token'),
    ('58150', 'pacu', 'token'),

    -- 49505 Inguinal Hernia Repair
    ('49505', 'hernia mesh', 'token'),
    ('49505', 'polypropylene mesh', 'token'),
    ('49505', 'prolene', 'token'),
    ('49505', 'suture', 'token'),
    ('49505', 'surgical drape', 'token'),
    ('49505', 'electrosurgery', 'token'),
    ('49505', 'spinal anesthesia tray', 'token'),
    ('49505', 'compression bandage', 'token'),
    ('49505', 'pacu', 'token'),

    -- 66984 Cataract Extraction with IOL
    ('66984', 'phacoemulsification', 'token'),
    ('66984', 'phaco', 'token'),
    ('66984', 'intraocular lens', 'token'),
    ('66984', 'iol', 'token'),
    ('66984', 'viscoelastic', 'token'),
    ('66984', 'ovd', 'token'),
    ('66984', 'balanced salt solution', 'token'),
    ('66984', 'bss', 'token'),
    ('66984', 'eye drape', 'token'),
    ('66984', 'eye shield', 'token'),
    ('66984', 'mydriatic', 'token'),

    -- I10 Hypertensive Urgency / Crisis
    ('I10', 'ecg', 'token'),
    ('I10', 'electrocardiogram', 'token'),
    ('I10', 'creatinine', 'token'),
    ('I10', 'bun', 'token'),
    ('I10', 'blood glucose', 'token'),
    ('I10', 'nicardipine', 'token'),
    ('I10', 'infusion set', 'token'),
    ('I10', 'urine protein', 'token'),

    -- E11.1 Type 2 Diabetes with DKA
    ('E11.1', 'capillary blood glucose', 'token'),
    ('E11.1', 'cbg', 'token'),
    ('E11.1', 'test strip', 'token'),
    ('E11.1', 'blood ketone', 'token'),
    ('E11.1', 'abg', 'token'),
    ('E11.1', 'serum electrolytes', 'token'),
    ('E11.1', 'regular insulin', 'token'),
    ('E11.1', 'potassium chloride', 'token'),
    ('E11.1', 'infusion pump', 'token'),
    ('E11.1', 'urinalysis', 'token')
) AS v(case_code, alias, kind)
JOIN public.philhealth_packages p ON p.case_code = v.case_code
ON CONFLICT (package_id, alias) DO UPDATE SET kind = EXCLUDED.kind;
