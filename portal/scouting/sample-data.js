// Public research example. Historical infrastructure is not a verified reuse credit or a power offer.
// No customer records, private contacts, commercial quotes or internal workflow instructions are included.
window.ProtonScoutingSample = {
  "version": "PM-ENERGY-SIM-001-DATA-v1",
  "researchDate": "2026-09-19",
  "region": "Mid-Atlantic US: New Jersey, Pennsylvania, Delaware, Maryland",
  "persona": "Example brief: smaller hosting operator researching a 0.5–2 MW expansion in NJ, PA, DE or MD; existing generation preferred.",
  "requestedMinMw": 0.5,
  "requestedMaxMw": 2,
  "searchSummary": {
    "recordsScreened": 229,
    "distinctSites": 125,
    "allCatalogRows": 2755,
    "operationalRows": 80,
    "screenedGenerationRows": 25,
    "screenedGenerationPhysicalIds": 19,
    "deepReviewedPhysicalSites": 4,
    "unresolvedCandidates": 2,
    "holds": 1,
    "exclusions": 1,
    "confirmedAvailableSites": 0,
    "method": "Screened retained EPA LMOP catalog records for NJ, PA, DE and MD, then reviewed four physical sites against public sources. Historical generation of 0.5–4 MW was an initial discovery lens for a buyer seeking 0.5–2 MW. Historical ratings do not establish an available allocation. Source rows were deduplicated by landfill ID; this is not a comprehensive ranking of all 125 regional sites.",
    "limitations": [
      "Historical catalog release September 2024; many resource measurements are from 2022 or earlier.",
      "Four sites deep-reviewed; other regional sites are not yet fully investigated.",
      "No owner contacted; no offer, usable space, actual net allocation, delivered energy price or committed deployment date confirmed.",
      "Public primary sources can conflict. Do not count unresolved candidates as qualified power offers.",
      "Separate source/project rows are not necessarily separate physical sites.",
      "No new financial or net-capacity engineering model produced.",
      "Source S-W returned HTTP 404 during review on 2026-09-19. SECCRA findings retain that source limitation; current commissioning remains unconfirmed."
    ]
  },
  "profiles": [
    {
      "id": "SIM-952",
      "name": "Pennsauken Sanitary Landfill",
      "location": "Pennsauken, NJ",
      "operator": "Pollution Control Financing Authority of Camden County, NJ",
      "lat": 39.991,
      "lng": -75.0342,
      "status": "unresolved",
      "priority": 1,
      "reportedGenerationMw": 1.85,
      "planningMw": null,
      "capacityBasis": "Historical EPA rating for the selected project row, not a sum of every project or expansion at this landfill. Not available power, a sustained-output guarantee, or a mining load allocation.",
      "measurementDate": "LMOP release 2024-09-04; gas 2022",
      "availableMw": null,
      "quotedEnergyPrice": null,
      "contact": {
        "name": "Pollution Control Financing Authority of Camden County",
        "role": "Public office referral",
        "phone": "856-665-8787",
        "email": null,
        "url": "https://www.pcfacc.com/",
        "note": "Unconfirmed; no external contact made."
      },
      "facts": [
        {
          "label": "Historical project rating",
          "value": "1.85 MW nameplate/rating in retained 2024 LMOP row",
          "basis": "Historical reported capacity; not offered capacity",
          "sourceIds": [
            "EPA-P"
          ],
          "id": "SIM-952-F01"
        },
        {
          "label": "Collected landfill gas",
          "value": "0.288 mmscfd; measurement year 2022",
          "basis": "Historical measurement",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-952-F02"
        },
        {
          "label": "Infrastructure reported",
          "value": "199 wells; 1800 cfm collection-system rating",
          "basis": "Retained 2024 inventory; individual infrastructure measurement dates not established",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-952-F03"
        },
        {
          "label": "Research finding 1",
          "value": "2004 contractor history reports three Caterpillar 3516 generator sets and 2.8 MW capacity, with power sold to a neighboring aluminum manufacturer.",
          "basis": "historical",
          "sourceIds": [
            "P-H"
          ],
          "id": "SIM-952-F04"
        },
        {
          "label": "Research finding 2",
          "value": "Historical scope included gas conditioning/pressurization, generator installation, flares, civil work and SCADA.",
          "basis": "historical",
          "sourceIds": [
            "P-H"
          ],
          "id": "SIM-952-F05"
        }
      ],
      "unknowns": [
        {
          "label": "Decision-maker authority",
          "question": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "label": "Owner willingness",
          "question": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "label": "Spare net power and allocations",
          "question": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "label": "Reliability and recent logs",
          "question": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "label": "Gas quality and treatment",
          "question": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "label": "Resource life",
          "question": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "label": "Equipment condition and use rights",
          "question": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "label": "Usable space and access",
          "question": "What specific pad/building space and truck access can be offered?"
        },
        {
          "label": "Electrical delivery point",
          "question": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "label": "Communications and cooling",
          "question": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "label": "Permits and use restrictions",
          "question": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "label": "Actual quoted energy price",
          "question": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "label": "All price components and minimums",
          "question": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "label": "Term, timing and existing commitments",
          "question": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "label": "Land, gas and power rights",
          "question": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "label": "Remaining construction and payer",
          "question": "What itemized construction remains, who pays, and what actual quotes exist?"
        },
        {
          "label": "Energization dependencies",
          "question": "What dependencies and lead times control energization?"
        }
      ],
      "sources": [
        {
          "id": "EPA-P",
          "title": "EPA LMOP project workbook (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
          "scope": "Historical project rows; not current offers.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "EPA-L",
          "title": "EPA LMOP landfill inventory (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
          "scope": "Historical gas and infrastructure report; unconfirmed present condition.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "P-O",
          "title": "PCFACC official site",
          "url": "https://www.pcfacc.com/",
          "publicationDate": null,
          "accessedDate": "2026-09-19",
          "basis": "Live primary page checked.",
          "scope": "Current public office contact and address.",
          "date": null,
          "checked": "2026-09-19"
        },
        {
          "id": "P-H",
          "title": "SCS Engineers Pennsauken project case study",
          "url": "https://www.scsengineers.com/scs-project-case-stu/landfill-gas-lfge-ppl-energy-services-pennsauken-new-jersey/",
          "publicationDate": null,
          "effectiveDate": "2004-11",
          "accessedDate": "2026-09-19",
          "basis": "Live engineering-contractor case study checked.",
          "scope": "2004 project history; not current equipment inventory or power offer.",
          "date": null,
          "checked": "2026-09-19"
        }
      ],
      "fit": "Within target region; historical reciprocating generation is relevant to the 0.5–2 MW load search. No owner-offered MW or price.",
      "concerns": [
        "Bundled 2024 operating row reports 1.85 MW, while the 2004 design history says 2.8 MW. Different dates/project scope; neither is available mining capacity.",
        "2022 collected gas of 0.288 mmscfd differs from undated project flow 0.57 mmscfd. Do not combine them into a current energy balance."
      ],
      "recommendation": "Existing generation history and commercial power-sale precedent; present allocation needs verification.",
      "nextQuestions": [
        "Who currently owns the generation equipment and controls its power sales?",
        "Is the historical neighboring offtake still active, and can any load be supplied without impairing it?",
        "What equipment remains operational after the reported project de-expansion?",
        "Would the current gas/power rights holder consider a 0.5–2 MW colocated mining load?",
        "What sustained net MW, if any, could be offered after current plant load and sales commitments?",
        "Can the owner provide a dated delivered-power quote with all charges, minimums, supply term and expiry?",
        "What usable pad, connection point, voltage, internet options and approval pathway are available?",
        "What recent generation/gas logs and equipment condition records can support a realistic deployment date?"
      ],
      "checklist": [
        {
          "id": "ID-01",
          "label": "Identity and location",
          "status": "partial",
          "value": "Pennsauken SLF; 9600 River Road; Pennsauken, NJ 08110; LMOP landfill ID 952",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "ID-02",
          "label": "Ownership and rights-holder identity",
          "status": "partial",
          "value": "Pollution Control Financing Authority of Camden County, NJ reported landfill owner/operator; current gas/power/surface-rights distinction unresolved",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-01",
          "label": "Public contact route",
          "status": "partial",
          "value": "Public office referral: 856-665-8787. Unconfirmed",
          "sourceIds": [
            "P-O"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-02",
          "label": "Decision-maker authority",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "id": "CT-03",
          "label": "Owner willingness",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "id": "EN-01",
          "label": "Energy source and project status",
          "status": "partial",
          "value": "Landfill gas / Reciprocating Engine; Operational in historical catalog. See newer findings/concerns.",
          "sourceIds": [
            "EPA-P",
            "P-O",
            "P-H"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-02",
          "label": "Reported resource measurements",
          "status": "partial",
          "value": "0.288 mmscfd collected (2022); 0 mmscfd flared (2019); methane 49.6% (test date not established). Historical only.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-03",
          "label": "Capacity bases",
          "status": "partial",
          "value": "Reported 1.85 MW. Customer target 0.5–2 MW. No offered/allocated MW; no new engineering capacity model performed.",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-04",
          "label": "Spare net power and allocations",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "id": "EN-05",
          "label": "Reliability and recent logs",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "id": "EN-06",
          "label": "Gas quality and treatment",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "id": "EN-07",
          "label": "Resource life",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "id": "IF-01",
          "label": "Infrastructure inventory",
          "status": "partial",
          "value": "199 wells; 1800 cfm collection-system rating. Condition, availability and reuse rights unknown.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "IF-02",
          "label": "Equipment condition and use rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "id": "IF-03",
          "label": "Usable space and access",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What specific pad/building space and truck access can be offered?"
        },
        {
          "id": "IF-04",
          "label": "Electrical delivery point",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "id": "IF-05",
          "label": "Communications and cooling",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "id": "IF-06",
          "label": "Permits and use restrictions",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "id": "CM-01",
          "label": "Actual quoted energy price",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "id": "CM-02",
          "label": "All price components and minimums",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "id": "CM-03",
          "label": "Term, timing and existing commitments",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "id": "CM-04",
          "label": "Land, gas and power rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "id": "CM-05",
          "label": "Remaining construction and payer",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What itemized construction remains, who pays, and what actual quotes exist?"
        },
        {
          "id": "CM-06",
          "label": "Energization dependencies",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What dependencies and lead times control energization?"
        },
        {
          "id": "EV-01",
          "label": "Evidence and dates",
          "status": "partial",
          "value": "Source register linked; historical measurement dates and checked date separated; conflicts retained.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "P-O",
            "P-H"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "FT-01",
          "label": "Customer fit and next action",
          "status": "partial",
          "value": "Within target region; historical reciprocating generation is relevant to the 0.5–2 MW load search. No owner-offered MW or price. Existing generation history and commercial power-sale precedent; present allocation needs verification.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "P-O",
            "P-H"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        }
      ],
      "sourceRecordIds": [
        "lmop_1023-0",
        "lmop_1023-1"
      ],
      "capitalSummary": "Remaining capital is not priced. Equipment condition, reuse rights, available electrical capacity and site works must be confirmed before any infrastructure savings can be credited.",
      "infrastructureSummary": "Historical records report 199 gas wells and a collection system. A 2004 project history describes gas conditioning, three generators, flares and controls; what remains usable today is unverified.",
      "dispositionLabel": "Needs owner confirmation",
      "nextStep": "Confirm the current generation owner, equipment condition and existing power-sales commitments before requesting a net-power allocation and itemized connection costs.",
      "remainingCapital": null,
      "verifiedReuseCredit": null,
      "infrastructureStatus": "historical-records-current-condition-unverified"
    },
    {
      "id": "SIM-1273",
      "name": "Bradford County Landfill / NTSWA",
      "location": "Troy, PA",
      "operator": "Northern Tier Solid Waste Authority (NTSWA), PA",
      "lat": 41.777,
      "lng": -76.63,
      "status": "unresolved",
      "priority": 2,
      "reportedGenerationMw": 1.6,
      "planningMw": null,
      "capacityBasis": "Historical EPA rating for the selected project row, not a sum of every project or expansion at this landfill. Not available power, a sustained-output guarantee, or a mining load allocation.",
      "measurementDate": "LMOP release 2024-09-04; gas 2022",
      "availableMw": null,
      "quotedEnergyPrice": null,
      "contact": {
        "name": "Northern Tier Solid Waste Authority",
        "role": "Official inquiry form",
        "phone": null,
        "email": null,
        "url": "https://www.ntswa.org/contact",
        "note": "Unconfirmed; no external contact made."
      },
      "facts": [
        {
          "label": "Historical project rating",
          "value": "1.6 MW nameplate/rating in retained 2024 LMOP row",
          "basis": "Historical reported capacity; not offered capacity",
          "sourceIds": [
            "EPA-P"
          ],
          "id": "SIM-1273-F01"
        },
        {
          "label": "Collected landfill gas",
          "value": "0.642 mmscfd; measurement year 2022",
          "basis": "Historical measurement",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-1273-F02"
        },
        {
          "label": "Infrastructure reported",
          "value": "46 wells; 1 flare(s); 1500 cfm collection-system rating",
          "basis": "Retained 2024 inventory; individual infrastructure measurement dates not established",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-1273-F03"
        },
        {
          "label": "Research finding 1",
          "value": "2015 state permit notice identifies NTSWA’s Bradford County landfill and an onsite Talen landfill-gas energy plant.",
          "basis": "historical",
          "sourceIds": [
            "B-R"
          ],
          "id": "SIM-1273-F04"
        }
      ],
      "unknowns": [
        {
          "label": "Decision-maker authority",
          "question": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "label": "Owner willingness",
          "question": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "label": "Spare net power and allocations",
          "question": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "label": "Reliability and recent logs",
          "question": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "label": "Gas quality and treatment",
          "question": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "label": "Resource life",
          "question": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "label": "Equipment condition and use rights",
          "question": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "label": "Usable space and access",
          "question": "What specific pad/building space and truck access can be offered?"
        },
        {
          "label": "Electrical delivery point",
          "question": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "label": "Communications and cooling",
          "question": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "label": "Permits and use restrictions",
          "question": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "label": "Actual quoted energy price",
          "question": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "label": "All price components and minimums",
          "question": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "label": "Term, timing and existing commitments",
          "question": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "label": "Land, gas and power rights",
          "question": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "label": "Remaining construction and payer",
          "question": "What itemized construction remains, who pays, and what actual quotes exist?"
        },
        {
          "label": "Energization dependencies",
          "question": "What dependencies and lead times control energization?"
        }
      ],
      "sources": [
        {
          "id": "EPA-P",
          "title": "EPA LMOP project workbook (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
          "scope": "Historical project rows; not current offers.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "EPA-L",
          "title": "EPA LMOP landfill inventory (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
          "scope": "Historical gas and infrastructure report; unconfirmed present condition.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "B-O",
          "title": "NTSWA official contact page",
          "url": "https://www.ntswa.org/contact",
          "publicationDate": null,
          "accessedDate": "2026-09-19",
          "basis": "Live authority contact form checked.",
          "scope": "Authority referral route; no response sent/received.",
          "date": null,
          "checked": "2026-09-19"
        },
        {
          "id": "B-R",
          "title": "Pennsylvania Bulletin 2015 Title V notice 08-00017",
          "url": "https://www.pacodeandbulletin.gov/secure/pabulletin/data/vol45/45-50/45-50.pdf",
          "publicationDate": "2015-12",
          "accessedDate": "2026-09-19",
          "basis": "Primary state search result retrieved; old permit notice only.",
          "scope": "NTSWA landfill in West Burlington Township, Bradford County aggregated with Talen LFGE plant. Does not establish current rights or permits.",
          "date": "2015-12",
          "checked": "2026-09-19"
        },
        {
          "id": "B-X",
          "title": "Pennsylvania Bulletin February 2026 renewal notice",
          "url": "https://www.pacodeandbulletin.gov/secure/pabulletin/data/vol56/56-7/226a.html",
          "publicationDate": "2026-02",
          "accessedDate": "2026-09-19",
          "basis": "Primary state search result retrieved.",
          "scope": "Mentions NTSWA LFGE but lists Brady Township, Lycoming County. LOCATION CONFLICT: not accepted as confirmed Bradford-site evidence.",
          "date": "2026-02",
          "checked": "2026-09-19"
        }
      ],
      "fit": "Within target region with historical 1.6 MW generation scale. Current available net output and commercialization are unknown.",
      "concerns": [
        "Catalog shows a 2024 expected closure year but still labels the landfill open; that year is not a current closure confirmation or supply-life estimate.",
        "A 2026 state notice names NTSWA LFGE but lists Brady Township, Lycoming County. It is withheld from accepted site facts until the location mismatch is resolved.",
        "2022 collected gas 0.642 mmscfd and undated project flow 0.69 mmscfd cannot establish present utilization or surplus."
      ],
      "recommendation": "Catalog reports a 1.6 MW engine project; current operator and rights require identity checks.",
      "nextQuestions": [
        "Confirm the exact physical plant ID, current energy operator and gas/power contract counterparties.",
        "Does the 2026 renewal notice concern this Bradford facility or a different site?",
        "What is the current landfill operating/closure schedule and gas resource forecast?",
        "Would the current gas/power rights holder consider a 0.5–2 MW colocated mining load?",
        "What sustained net MW, if any, could be offered after current plant load and sales commitments?",
        "Can the owner provide a dated delivered-power quote with all charges, minimums, supply term and expiry?",
        "What usable pad, connection point, voltage, internet options and approval pathway are available?",
        "What recent generation/gas logs and equipment condition records can support a realistic deployment date?"
      ],
      "checklist": [
        {
          "id": "ID-01",
          "label": "Identity and location",
          "status": "partial",
          "value": "Bradford County Landfill; 108 Steam Hollow Road off U.S. Route 6; Troy, PA 16947; LMOP landfill ID 1273",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "ID-02",
          "label": "Ownership and rights-holder identity",
          "status": "partial",
          "value": "Northern Tier Solid Waste Authority (NTSWA), PA reported landfill owner/operator; current gas/power/surface-rights distinction unresolved",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-01",
          "label": "Public contact route",
          "status": "partial",
          "value": "Official inquiry form: https://www.ntswa.org/contact. Unconfirmed",
          "sourceIds": [
            "B-O"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-02",
          "label": "Decision-maker authority",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "id": "CT-03",
          "label": "Owner willingness",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "id": "EN-01",
          "label": "Energy source and project status",
          "status": "partial",
          "value": "Landfill gas / Reciprocating Engine; Operational in historical catalog. See newer findings/concerns.",
          "sourceIds": [
            "EPA-P",
            "B-O",
            "B-R",
            "B-X"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-02",
          "label": "Reported resource measurements",
          "status": "partial",
          "value": "0.642 mmscfd collected (2022); 0 mmscfd flared (2021); methane 47.8% (test date not established). Historical only.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-03",
          "label": "Capacity bases",
          "status": "partial",
          "value": "Reported 1.6 MW. Customer target 0.5–2 MW. No offered/allocated MW; no new engineering capacity model performed.",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-04",
          "label": "Spare net power and allocations",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "id": "EN-05",
          "label": "Reliability and recent logs",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "id": "EN-06",
          "label": "Gas quality and treatment",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "id": "EN-07",
          "label": "Resource life",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "id": "IF-01",
          "label": "Infrastructure inventory",
          "status": "partial",
          "value": "46 wells; 1 flare(s); 1500 cfm collection-system rating. Condition, availability and reuse rights unknown.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "IF-02",
          "label": "Equipment condition and use rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "id": "IF-03",
          "label": "Usable space and access",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What specific pad/building space and truck access can be offered?"
        },
        {
          "id": "IF-04",
          "label": "Electrical delivery point",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "id": "IF-05",
          "label": "Communications and cooling",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "id": "IF-06",
          "label": "Permits and use restrictions",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "id": "CM-01",
          "label": "Actual quoted energy price",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "id": "CM-02",
          "label": "All price components and minimums",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "id": "CM-03",
          "label": "Term, timing and existing commitments",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "id": "CM-04",
          "label": "Land, gas and power rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "id": "CM-05",
          "label": "Remaining construction and payer",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What itemized construction remains, who pays, and what actual quotes exist?"
        },
        {
          "id": "CM-06",
          "label": "Energization dependencies",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What dependencies and lead times control energization?"
        },
        {
          "id": "EV-01",
          "label": "Evidence and dates",
          "status": "partial",
          "value": "Source register linked; historical measurement dates and checked date separated; conflicts retained.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "B-O",
            "B-R",
            "B-X"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "FT-01",
          "label": "Customer fit and next action",
          "status": "partial",
          "value": "Within target region with historical 1.6 MW generation scale. Current available net output and commercialization are unknown. Catalog reports a 1.6 MW engine project; current operator and rights require identity checks.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "B-O",
            "B-R",
            "B-X"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        }
      ],
      "sourceRecordIds": [
        "lmop_1348-0",
        "lmop_1348-1",
        "lmop_1348-2",
        "lmop_1348-3"
      ],
      "capitalSummary": "Remaining capital is not priced. Existing generation does not establish usable equipment, spare capacity or permission to connect; no reuse savings have been credited.",
      "infrastructureSummary": "Historical records report 46 gas wells, one flare and a 1.6 MW engine project. A 2015 permit notice identifies an onsite energy plant; current equipment and operator remain unverified.",
      "dispositionLabel": "Needs owner confirmation",
      "nextStep": "Resolve the plant identity and current gas/power rights first. The 2026 notice naming a different county cannot confirm the permit status for this site.",
      "remainingCapital": null,
      "verifiedReuseCredit": null,
      "infrastructureStatus": "historical-records-current-condition-unverified"
    },
    {
      "id": "SIM-734",
      "name": "Alpha Ridge Landfill",
      "location": "Marriottsville, MD",
      "operator": "Howard County, MD",
      "lat": 39.30578,
      "lng": -76.8988,
      "status": "hold",
      "priority": 3,
      "reportedGenerationMw": 1.059,
      "planningMw": null,
      "capacityBasis": "Historical EPA rating for the selected project row, not a sum of every project or expansion at this landfill. Not available power, a sustained-output guarantee, or a mining load allocation.",
      "measurementDate": "LMOP release 2024-09-04; gas 2022",
      "availableMw": null,
      "quotedEnergyPrice": null,
      "contact": {
        "name": "Howard County Alpha Ridge Landfill",
        "role": "Public facility office",
        "phone": "410-313-6444",
        "email": null,
        "url": "https://www.howardcountymd.gov/bureau-environmental-services/alpha-ridge-landfill",
        "note": "Commercial authority unconfirmed; no external contact made."
      },
      "facts": [
        {
          "label": "Historical project rating",
          "value": "1.059 MW nameplate/rating in retained 2024 LMOP row",
          "basis": "Historical reported capacity; not offered capacity",
          "sourceIds": [
            "EPA-P"
          ],
          "id": "SIM-734-F01"
        },
        {
          "label": "Collected landfill gas",
          "value": "0.22 mmscfd; measurement year 2022",
          "basis": "Historical measurement",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-734-F02"
        },
        {
          "label": "Infrastructure reported",
          "value": "113 wells; 800 cfm collection-system rating",
          "basis": "Retained 2024 inventory; individual infrastructure measurement dates not established",
          "sourceIds": [
            "EPA-L"
          ],
          "id": "SIM-734-F03"
        },
        {
          "label": "Research finding 1",
          "value": "2011 project document describes generator/compressor installation, onsite plant consumption, and sale of the remainder.",
          "basis": "historical",
          "sourceIds": [
            "A-H"
          ],
          "id": "SIM-734-F04"
        },
        {
          "label": "Research finding 2",
          "value": "County 2025–2034 waste plan anticipates decommissioning the LFGE generator during the planning period, with MDE approval.",
          "basis": "documented plan",
          "sourceIds": [
            "A-D"
          ],
          "id": "SIM-734-F05"
        }
      ],
      "unknowns": [
        {
          "label": "Decision-maker authority",
          "question": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "label": "Owner willingness",
          "question": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "label": "Spare net power and allocations",
          "question": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "label": "Reliability and recent logs",
          "question": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "label": "Gas quality and treatment",
          "question": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "label": "Resource life",
          "question": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "label": "Equipment condition and use rights",
          "question": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "label": "Usable space and access",
          "question": "What specific pad/building space and truck access can be offered?"
        },
        {
          "label": "Electrical delivery point",
          "question": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "label": "Communications and cooling",
          "question": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "label": "Permits and use restrictions",
          "question": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "label": "Actual quoted energy price",
          "question": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "label": "All price components and minimums",
          "question": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "label": "Term, timing and existing commitments",
          "question": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "label": "Land, gas and power rights",
          "question": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "label": "Remaining construction and payer",
          "question": "What itemized construction remains, who pays, and what actual quotes exist?"
        }
      ],
      "sources": [
        {
          "id": "EPA-P",
          "title": "EPA LMOP project workbook (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
          "scope": "Historical project rows; not current offers.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "EPA-L",
          "title": "EPA LMOP landfill inventory (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
          "scope": "Historical gas and infrastructure report; unconfirmed present condition.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "A-O",
          "title": "Howard County Alpha Ridge official page",
          "url": "https://www.howardcountymd.gov/bureau-environmental-services/alpha-ridge-landfill",
          "publicationDate": null,
          "accessedDate": "2026-09-19",
          "basis": "Live primary page checked.",
          "scope": "Location, office contact, landfill history.",
          "date": null,
          "checked": "2026-09-19"
        },
        {
          "id": "A-H",
          "title": "Alpha Ridge gas-to-energy newsletter",
          "url": "https://www.howardcountymd.gov/alpha-ridge-landfill/resource/newsletter-nov-2011",
          "publicationDate": "2011-11",
          "accessedDate": "2026-09-19",
          "basis": "Historical county project document checked; search indexing date ignored.",
          "scope": "Design-stage generator, compressor, onsite consumption and sale concept.",
          "date": "2011-11",
          "checked": "2026-09-19"
        },
        {
          "id": "A-D",
          "title": "Howard County 2025–2034 Solid Waste Management Plan, CR143-2025",
          "url": "https://cc.howardcountymd.gov/sites/default/files/2025-07/CR143-2025.pdf",
          "publicationDate": "2025-07",
          "accessedDate": "2026-09-19",
          "locator": "Printed page 83 / zero-based PDF index 87 (physical PDF page 88); section 4.7.3, with MDE-approval condition on preceding page",
          "basis": "County plan PDF text checked.",
          "scope": "Anticipated generator decommissioning during planning period subject to MDE approval; not proof decommissioning already occurred.",
          "date": "2025-07",
          "checked": "2026-09-19"
        }
      ],
      "fit": "Geography and historical 1.059 MW nameplate pass the first screen. Planned decommissioning creates a material conflict with sustained existing-generation supply.",
      "concerns": [
        "Historical operational/nameplate listing is not evidence of long-term availability; the newer county plan must govern the next question.",
        "No evidence found in this bounded review establishes that decommissioning has already occurred or gives an exact date."
      ],
      "recommendation": "County plan anticipates generator decommissioning; resolve before treating as a long-term generation prospect.",
      "nextQuestions": [
        "What is the current generator status and approved decommissioning schedule?",
        "Would any alternative gas-use proposal be entertained before spending time on pricing?",
        "Would the current gas/power rights holder consider a 0.5–2 MW colocated mining load?",
        "What sustained net MW, if any, could be offered after current plant load and sales commitments?",
        "Can the owner provide a dated delivered-power quote with all charges, minimums, supply term and expiry?",
        "What usable pad, connection point, voltage, internet options and approval pathway are available?",
        "What recent generation/gas logs and equipment condition records can support a realistic deployment date?"
      ],
      "checklist": [
        {
          "id": "ID-01",
          "label": "Identity and location",
          "status": "partial",
          "value": "Alpha Ridge SLF; 2350 Marriottsville Road; Marriottsville, MD 21104; LMOP landfill ID 734",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "ID-02",
          "label": "Ownership and rights-holder identity",
          "status": "partial",
          "value": "Howard County, MD reported landfill owner/operator; current gas/power/surface-rights distinction unresolved",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-01",
          "label": "Public contact route",
          "status": "partial",
          "value": "Public facility office: 410-313-6444. Commercial authority unconfirmed",
          "sourceIds": [
            "A-O"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "CT-02",
          "label": "Decision-maker authority",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who can discuss commercial terms and approve or sign?"
        },
        {
          "id": "CT-03",
          "label": "Owner willingness",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Is the rights holder willing to consider colocated mining?"
        },
        {
          "id": "EN-01",
          "label": "Energy source and project status",
          "status": "partial",
          "value": "Landfill gas / Reciprocating Engine; Operational in historical catalog. See newer findings/concerns.",
          "sourceIds": [
            "EPA-P",
            "A-O",
            "A-H",
            "A-D"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-02",
          "label": "Reported resource measurements",
          "status": "partial",
          "value": "0.22 mmscfd collected (2022); 0.133 mmscfd flared (2022); methane 43.2% (test date not established). Historical only.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-03",
          "label": "Capacity bases",
          "status": "partial",
          "value": "Reported 1.059 MW. Customer target 0.5–2 MW. No offered/allocated MW; no new engineering capacity model performed.",
          "sourceIds": [
            "EPA-P"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "EN-04",
          "label": "Spare net power and allocations",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
        },
        {
          "id": "EN-05",
          "label": "Reliability and recent logs",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
        },
        {
          "id": "EN-06",
          "label": "Gas quality and treatment",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
        },
        {
          "id": "EN-07",
          "label": "Resource life",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a current supply-duration/decline forecast and assumptions."
        },
        {
          "id": "IF-01",
          "label": "Infrastructure inventory",
          "status": "partial",
          "value": "113 wells; 800 cfm collection-system rating. Condition, availability and reuse rights unknown.",
          "sourceIds": [
            "EPA-L"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "IF-02",
          "label": "Equipment condition and use rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
        },
        {
          "id": "IF-03",
          "label": "Usable space and access",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What specific pad/building space and truck access can be offered?"
        },
        {
          "id": "IF-04",
          "label": "Electrical delivery point",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
        },
        {
          "id": "IF-05",
          "label": "Communications and cooling",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What internet service and cooling/water options can actually be supplied?"
        },
        {
          "id": "IF-06",
          "label": "Permits and use restrictions",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What approvals and operating restrictions apply to this proposed mining use?"
        },
        {
          "id": "CM-01",
          "label": "Actual quoted energy price",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
        },
        {
          "id": "CM-02",
          "label": "All price components and minimums",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
        },
        {
          "id": "CM-03",
          "label": "Term, timing and existing commitments",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What start date, supply term, procurement deadline and existing offtake apply?"
        },
        {
          "id": "CM-04",
          "label": "Land, gas and power rights",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "Who controls gas/power/land and what agreements establish access?"
        },
        {
          "id": "CM-05",
          "label": "Remaining construction and payer",
          "status": "unknown",
          "value": "Not established by bounded public research.",
          "sourceIds": [],
          "nextQuestion": "What itemized construction remains, who pays, and what actual quotes exist?"
        },
        {
          "id": "CM-06",
          "label": "Energization dependencies",
          "status": "partial",
          "value": "County plan anticipates LFGE generator decommissioning in 2025–2034 planning period subject to MDE approval. Exact date/current execution unknown.",
          "sourceIds": [
            "A-D"
          ],
          "nextQuestion": "What dependencies and lead times control energization?"
        },
        {
          "id": "EV-01",
          "label": "Evidence and dates",
          "status": "partial",
          "value": "Source register linked; historical measurement dates and checked date separated; conflicts retained.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "A-O",
            "A-H",
            "A-D"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        },
        {
          "id": "FT-01",
          "label": "Customer fit and next action",
          "status": "partial",
          "value": "Geography and historical 1.059 MW nameplate pass the first screen. Planned decommissioning creates a material conflict with sustained existing-generation supply. County plan anticipates generator decommissioning; resolve before treating as a long-term generation prospect.",
          "sourceIds": [
            "EPA-P",
            "EPA-L",
            "A-O",
            "A-H",
            "A-D"
          ],
          "nextQuestion": "Confirm current scope/date with original source or owner."
        }
      ],
      "sourceRecordIds": [
        "lmop_804-0"
      ],
      "capitalSummary": "Remaining capital is not priced. Planned decommissioning prevents assuming generation can be reused; replacement equipment, approvals and connection work have not been scoped or quoted.",
      "infrastructureSummary": "Historical records report 113 gas wells and a generator/compressor project. The county 2025–2034 plan anticipates generator decommissioning, subject to MDE approval.",
      "dispositionLabel": "On hold · generator plan",
      "nextStep": "Ask the county for the current generator status and approved decommissioning schedule before spending on a mining layout or electrical design.",
      "remainingCapital": null,
      "verifiedReuseCredit": null,
      "infrastructureStatus": "historical-records-current-condition-unverified"
    }
  ],
  "exclusions": [
    {
      "name": "SECCRA Community Landfill",
      "reason": "Owner announced electricity-to-RNG replacement under a 20-year Waga agreement.",
      "sources": [
        {
          "id": "EPA-P",
          "title": "EPA LMOP project workbook (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
          "scope": "Historical project rows; not current offers.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "EPA-L",
          "title": "EPA LMOP landfill inventory (retained September 2024 release)",
          "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
          "publicationDate": "2024-09-04",
          "accessedDate": "2026-09-19",
          "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
          "scope": "Historical gas and infrastructure report; unconfirmed present condition.",
          "date": "2024-09-04",
          "checked": "2026-09-19"
        },
        {
          "id": "S-O",
          "title": "SECCRA RNG partnership announcement",
          "url": "https://seccra.org/whats-happening/2024/12/19/seccra-partners-with-waga-energy-to-convert-landfill-gas-into-renewable-natural-gas",
          "publicationDate": "2024-12-19",
          "accessedDate": "2026-09-19",
          "basis": "Owner announcement checked.",
          "scope": "Plan to replace aging electricity generation with RNG.",
          "date": "2024-12-19",
          "checked": "2026-09-19"
        },
        {
          "id": "S-W",
          "title": "Waga Energy SECCRA project agreement release",
          "url": "https://waga-energy.com/wp-content/uploads/2024/12/2024-18-12_RNG_SECCRA_WagaEnergy_US.pdf",
          "publicationDate": "2024-12-18",
          "accessedDate": "2026-09-19",
          "basis": "Historical research citation. Source link returned HTTP 404 during review on 2026-09-19; unavailable for independent rechecking.",
          "scope": "20-year agreement; Waga to finance, build, own and operate RNG plant; commissioning then expected 2026. No current commissioning confirmation.",
          "date": "2024-12-18",
          "checked": "2026-09-19",
          "accessStatus": "unavailable-404",
          "accessNote": "Source S-W returned HTTP 404 during review on 2026-09-19; its reported agreement terms could not be independently rechecked from that link. The dated owner announcement still supports the RNG-transition concern. Commissioning status is unconfirmed."
        },
        {
          "id": "S-H",
          "title": "SECCRA gas monitoring and power page",
          "url": "https://seccra.org/gas-monitoring-and-control",
          "publicationDate": null,
          "accessedDate": "2026-09-19",
          "basis": "Owner page checked.",
          "scope": "Undated page says approximately 2.4 MW/full operation; conflicts with later dated RNG replacement announcement.",
          "date": null,
          "checked": "2026-09-19"
        }
      ],
      "profile": {
        "id": "SIM-1250",
        "name": "SECCRA Community Landfill",
        "location": "West Grove, PA",
        "operator": "Southeastern Chester County Refuse Authority (SECCRA), PA",
        "lat": 39.86729,
        "lng": -75.84115,
        "status": "excluded",
        "priority": 4,
        "reportedGenerationMw": 0.87,
        "planningMw": null,
        "capacityBasis": "Historical EPA rating for the selected project row, not a sum of every project or expansion at this landfill. Not available power, a sustained-output guarantee, or a mining load allocation.",
        "measurementDate": "LMOP release 2024-09-04; gas 2022",
        "availableMw": null,
        "quotedEnergyPrice": null,
        "contact": {
          "name": "Southeastern Chester County Refuse Authority",
          "role": "Official owner website",
          "phone": null,
          "email": null,
          "url": "https://seccra.org/",
          "note": "Not investigated further after exclusion; no external contact made."
        },
        "facts": [
          {
            "label": "Historical project rating",
            "value": "0.87 MW nameplate/rating in retained 2024 LMOP row",
            "basis": "Historical reported capacity; not offered capacity",
            "sourceIds": [
              "EPA-P"
            ],
            "id": "SIM-1250-F01"
          },
          {
            "label": "Collected landfill gas",
            "value": "1.215 mmscfd; measurement year 2022",
            "basis": "Historical measurement",
            "sourceIds": [
              "EPA-L"
            ],
            "id": "SIM-1250-F02"
          },
          {
            "label": "Infrastructure reported",
            "value": "66 wells; 1 flare(s); 1200 cfm collection-system rating",
            "basis": "Retained 2024 inventory; individual infrastructure measurement dates not established",
            "sourceIds": [
              "EPA-L"
            ],
            "id": "SIM-1250-F03"
          },
          {
            "label": "Research finding 1",
            "value": "SECCRA’s December 2024 announcement says it will replace its aging electricity-generation system with RNG production.",
            "basis": "owner documented plan",
            "sourceIds": [
              "S-O"
            ],
            "id": "SIM-1250-F04"
          },
          {
            "label": "Research finding 2",
            "value": "Waga’s December 2024 release reports a 20-year agreement and its responsibility to finance, build, own and operate the RNG facility. Source link unavailable during review; current commissioning was not verified.",
            "basis": "Historical research finding; source S-W returned HTTP 404 during review",
            "sourceIds": [
              "S-W"
            ],
            "id": "SIM-1250-F05"
          }
        ],
        "unknowns": [
          {
            "label": "Decision-maker authority",
            "question": "Who can discuss commercial terms and approve or sign?"
          },
          {
            "label": "Owner willingness",
            "question": "Is the rights holder willing to consider colocated mining?"
          },
          {
            "label": "Spare net power and allocations",
            "question": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
          },
          {
            "label": "Reliability and recent logs",
            "question": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
          },
          {
            "label": "Gas quality and treatment",
            "question": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
          },
          {
            "label": "Resource life",
            "question": "Provide a current supply-duration/decline forecast and assumptions."
          },
          {
            "label": "Equipment condition and use rights",
            "question": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
          },
          {
            "label": "Usable space and access",
            "question": "What specific pad/building space and truck access can be offered?"
          },
          {
            "label": "Electrical delivery point",
            "question": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
          },
          {
            "label": "Communications and cooling",
            "question": "What internet service and cooling/water options can actually be supplied?"
          },
          {
            "label": "Permits and use restrictions",
            "question": "What approvals and operating restrictions apply to this proposed mining use?"
          },
          {
            "label": "Actual quoted energy price",
            "question": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
          },
          {
            "label": "All price components and minimums",
            "question": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
          },
          {
            "label": "Land, gas and power rights",
            "question": "Who controls gas/power/land and what agreements establish access?"
          },
          {
            "label": "Remaining construction and payer",
            "question": "What itemized construction remains, who pays, and what actual quotes exist?"
          },
          {
            "label": "Energization dependencies",
            "question": "What dependencies and lead times control energization?"
          }
        ],
        "sources": [
          {
            "id": "EPA-P",
            "title": "EPA LMOP project workbook (retained September 2024 release)",
            "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
            "publicationDate": "2024-09-04",
            "accessedDate": "2026-09-19",
            "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
            "scope": "Historical project rows; not current offers.",
            "date": "2024-09-04",
            "checked": "2026-09-19"
          },
          {
            "id": "EPA-L",
            "title": "EPA LMOP landfill inventory (retained September 2024 release)",
            "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
            "publicationDate": "2024-09-04",
            "accessedDate": "2026-09-19",
            "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
            "scope": "Historical gas and infrastructure report; unconfirmed present condition.",
            "date": "2024-09-04",
            "checked": "2026-09-19"
          },
          {
            "id": "S-O",
            "title": "SECCRA RNG partnership announcement",
            "url": "https://seccra.org/whats-happening/2024/12/19/seccra-partners-with-waga-energy-to-convert-landfill-gas-into-renewable-natural-gas",
            "publicationDate": "2024-12-19",
            "accessedDate": "2026-09-19",
            "basis": "Owner announcement checked.",
            "scope": "Plan to replace aging electricity generation with RNG.",
            "date": "2024-12-19",
            "checked": "2026-09-19"
          },
          {
            "id": "S-W",
            "title": "Waga Energy SECCRA project agreement release",
            "url": "https://waga-energy.com/wp-content/uploads/2024/12/2024-18-12_RNG_SECCRA_WagaEnergy_US.pdf",
            "publicationDate": "2024-12-18",
            "accessedDate": "2026-09-19",
            "basis": "Historical research citation. Source link returned HTTP 404 during review on 2026-09-19; unavailable for independent rechecking.",
            "scope": "20-year agreement; Waga to finance, build, own and operate RNG plant; commissioning then expected 2026. No current commissioning confirmation.",
            "date": "2024-12-18",
            "checked": "2026-09-19",
            "accessStatus": "unavailable-404",
            "accessNote": "Source S-W returned HTTP 404 during review on 2026-09-19; its reported agreement terms could not be independently rechecked from that link. The dated owner announcement still supports the RNG-transition concern. Commissioning status is unconfirmed."
          },
          {
            "id": "S-H",
            "title": "SECCRA gas monitoring and power page",
            "url": "https://seccra.org/gas-monitoring-and-control",
            "publicationDate": null,
            "accessedDate": "2026-09-19",
            "basis": "Owner page checked.",
            "scope": "Undated page says approximately 2.4 MW/full operation; conflicts with later dated RNG replacement announcement.",
            "date": null,
            "checked": "2026-09-19"
          }
        ],
        "fit": "Excluded from this initial existing-generation sourcing shortlist due to an announced competing long-term resource pathway. Does not prove every future arrangement is impossible.",
        "concerns": [
          "Undated owner page still reports roughly 2.4 MW electricity generation; the later dated replacement announcement makes this unsafe to market as uncommitted power.",
          "The developer forecast 2026 commissioning in 2024. Actual commissioning date/status was not verified in this bounded review.",
          "Source S-W returned HTTP 404 during review on 2026-09-19; its reported agreement terms could not be independently rechecked from that link. The dated owner announcement still supports the RNG-transition concern. Commissioning status is unconfirmed."
        ],
        "recommendation": "Owner announced electricity-to-RNG replacement under a 20-year Waga agreement.",
        "nextQuestions": [
          "Only reopen if buyer deliberately wants residual/transition opportunities and owner confirms uncommitted resource."
        ],
        "checklist": [
          {
            "id": "ID-01",
            "label": "Identity and location",
            "status": "partial",
            "value": "SECCRA Community Landfill; 219 Street Road; West Grove, PA 19390; LMOP landfill ID 1250",
            "sourceIds": [
              "EPA-P"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "ID-02",
            "label": "Ownership and rights-holder identity",
            "status": "partial",
            "value": "Southeastern Chester County Refuse Authority (SECCRA), PA reported landfill owner/operator; current gas/power/surface-rights distinction unresolved",
            "sourceIds": [
              "EPA-L"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "CT-01",
            "label": "Public contact route",
            "status": "partial",
            "value": "Official owner website: https://seccra.org/. Not investigated further after exclusion",
            "sourceIds": [
              "S-O"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "CT-02",
            "label": "Decision-maker authority",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Who can discuss commercial terms and approve or sign?"
          },
          {
            "id": "CT-03",
            "label": "Owner willingness",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Is the rights holder willing to consider colocated mining?"
          },
          {
            "id": "EN-01",
            "label": "Energy source and project status",
            "status": "partial",
            "value": "Landfill gas / Reciprocating Engine; Operational in historical catalog. See newer findings/concerns.",
            "sourceIds": [
              "EPA-P",
              "S-O",
              "S-W",
              "S-H"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "EN-02",
            "label": "Reported resource measurements",
            "status": "partial",
            "value": "1.215 mmscfd collected (2022); 1.062 mmscfd flared (2022); methane 54% (test date not established). Historical only.",
            "sourceIds": [
              "EPA-L"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "EN-03",
            "label": "Capacity bases",
            "status": "partial",
            "value": "Reported 0.87 MW. Customer target 0.5–2 MW. No offered/allocated MW; no new engineering capacity model performed.",
            "sourceIds": [
              "EPA-P"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "EN-04",
            "label": "Spare net power and allocations",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What sustained net MW could actually be allocated after plant loads and existing commitments?"
          },
          {
            "id": "EN-05",
            "label": "Reliability and recent logs",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Provide recent generation/flow logs, downtime, seasonal variation and curtailment terms."
          },
          {
            "id": "EN-06",
            "label": "Gas quality and treatment",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Provide dated gas composition, heating value, pressure, H2S and siloxane results."
          },
          {
            "id": "EN-07",
            "label": "Resource life",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Provide a current supply-duration/decline forecast and assumptions."
          },
          {
            "id": "IF-01",
            "label": "Infrastructure inventory",
            "status": "partial",
            "value": "66 wells; 1 flare(s); 1200 cfm collection-system rating. Condition, availability and reuse rights unknown.",
            "sourceIds": [
              "EPA-L"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "IF-02",
            "label": "Equipment condition and use rights",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Which equipment remains usable, who owns it, and what maintenance/repair is needed?"
          },
          {
            "id": "IF-03",
            "label": "Usable space and access",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What specific pad/building space and truck access can be offered?"
          },
          {
            "id": "IF-04",
            "label": "Electrical delivery point",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What connection point, voltage, transformer/switchgear capacity and metering are available?"
          },
          {
            "id": "IF-05",
            "label": "Communications and cooling",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What internet service and cooling/water options can actually be supplied?"
          },
          {
            "id": "IF-06",
            "label": "Permits and use restrictions",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What approvals and operating restrictions apply to this proposed mining use?"
          },
          {
            "id": "CM-01",
            "label": "Actual quoted energy price",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Provide a dated gas/delivered-power quote, currency/unit, issuer and expiry."
          },
          {
            "id": "CM-02",
            "label": "All price components and minimums",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Identify fuel, generation, O&M, losses, fees, fixed charges, minimums, deposits and escalation."
          },
          {
            "id": "CM-03",
            "label": "Term, timing and existing commitments",
            "status": "partial",
            "value": "Developer reports 20-year RNG agreement in Dec2024; expected 2026 commissioning then, actual commissioning not established. Source S-W returned HTTP 404 during review; agreement terms need re-verification.",
            "sourceIds": [
              "S-W"
            ],
            "nextQuestion": "What start date, supply term, procurement deadline and existing offtake apply?"
          },
          {
            "id": "CM-04",
            "label": "Land, gas and power rights",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "Who controls gas/power/land and what agreements establish access?"
          },
          {
            "id": "CM-05",
            "label": "Remaining construction and payer",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What itemized construction remains, who pays, and what actual quotes exist?"
          },
          {
            "id": "CM-06",
            "label": "Energization dependencies",
            "status": "unknown",
            "value": "Not established by bounded public research.",
            "sourceIds": [],
            "nextQuestion": "What dependencies and lead times control energization?"
          },
          {
            "id": "EV-01",
            "label": "Evidence and dates",
            "status": "partial",
            "value": "Source register linked; historical measurement dates and checked date separated; conflicts retained. Source S-W returned HTTP 404 during review on 2026-09-19.",
            "sourceIds": [
              "EPA-P",
              "EPA-L",
              "S-O",
              "S-W",
              "S-H"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          },
          {
            "id": "FT-01",
            "label": "Customer fit and next action",
            "status": "partial",
            "value": "Excluded from this initial existing-generation sourcing shortlist due to an announced competing long-term resource pathway. Does not prove every future arrangement is impossible. Owner announced electricity-to-RNG replacement under a 20-year Waga agreement.",
            "sourceIds": [
              "EPA-P",
              "EPA-L",
              "S-O",
              "S-W",
              "S-H"
            ],
            "nextQuestion": "Confirm current scope/date with original source or owner."
          }
        ],
        "sourceRecordIds": [
          "lmop_1325-0",
          "lmop_1325-1",
          "lmop_1325-2",
          "lmop_201735-0"
        ],
        "capitalSummary": "Remaining capital is not priced. No generation reuse or cost savings are assumed because of the competing RNG pathway; available resource and access rights are unconfirmed.",
        "infrastructureSummary": "Historical records report 66 gas wells, one flare and electricity generation. A dated owner announcement plans to replace aging generation with renewable natural gas production.",
        "dispositionLabel": "Excluded · RNG transition",
        "nextStep": "Keep out of the initial shortlist. Reopen only if the owner confirms an uncommitted resource and the buyer wants a transition opportunity.",
        "remainingCapital": null,
        "verifiedReuseCredit": null,
        "infrastructureStatus": "historical-records-current-condition-unverified"
      }
    }
  ],
  "assumptions": [
    "0.5–2 MW is the example buyer load; it is not an assertion any candidate can supply it.",
    "Existing generation is a preference for early research; actual availability and price are later confirmation questions.",
    "Sample content is real desktop research in a simulated customer journey.",
    "No charge, reservation, email, call, subscription or external delivery occurred.",
    "This is a public research example, not live available inventory. Changing a search brief does not produce new research."
  ],
  "sourceRegister": [
    {
      "id": "EPA-P",
      "title": "EPA LMOP project workbook (retained September 2024 release)",
      "url": "https://www.epa.gov/system/files/documents/2024-09/lmopdata.xlsx",
      "publicationDate": "2024-09-04",
      "accessedDate": "2026-09-19",
      "basis": "Historical EPA project records retained in the research catalog; workbook not downloaded again for this example.",
      "scope": "Historical project rows; not current offers."
    },
    {
      "id": "EPA-L",
      "title": "EPA LMOP landfill inventory (retained September 2024 release)",
      "url": "https://www.epa.gov/system/files/documents/2024-09/landfilllmopdata.xlsx",
      "publicationDate": "2024-09-04",
      "accessedDate": "2026-09-19",
      "basis": "Historical EPA landfill records retained in the research catalog; individual measurements keep their reported years.",
      "scope": "Historical gas and infrastructure report; unconfirmed present condition."
    },
    {
      "id": "P-O",
      "title": "PCFACC official site",
      "url": "https://www.pcfacc.com/",
      "publicationDate": null,
      "accessedDate": "2026-09-19",
      "basis": "Live primary page checked.",
      "scope": "Current public office contact and address."
    },
    {
      "id": "P-H",
      "title": "SCS Engineers Pennsauken project case study",
      "url": "https://www.scsengineers.com/scs-project-case-stu/landfill-gas-lfge-ppl-energy-services-pennsauken-new-jersey/",
      "publicationDate": null,
      "effectiveDate": "2004-11",
      "accessedDate": "2026-09-19",
      "basis": "Live engineering-contractor case study checked.",
      "scope": "2004 project history; not current equipment inventory or power offer."
    },
    {
      "id": "B-O",
      "title": "NTSWA official contact page",
      "url": "https://www.ntswa.org/contact",
      "publicationDate": null,
      "accessedDate": "2026-09-19",
      "basis": "Live authority contact form checked.",
      "scope": "Authority referral route; no response sent/received."
    },
    {
      "id": "B-R",
      "title": "Pennsylvania Bulletin 2015 Title V notice 08-00017",
      "url": "https://www.pacodeandbulletin.gov/secure/pabulletin/data/vol45/45-50/45-50.pdf",
      "publicationDate": "2015-12",
      "accessedDate": "2026-09-19",
      "basis": "Primary state search result retrieved; old permit notice only.",
      "scope": "NTSWA landfill in West Burlington Township, Bradford County aggregated with Talen LFGE plant. Does not establish current rights or permits."
    },
    {
      "id": "B-X",
      "title": "Pennsylvania Bulletin February 2026 renewal notice",
      "url": "https://www.pacodeandbulletin.gov/secure/pabulletin/data/vol56/56-7/226a.html",
      "publicationDate": "2026-02",
      "accessedDate": "2026-09-19",
      "basis": "Primary state search result retrieved.",
      "scope": "Mentions NTSWA LFGE but lists Brady Township, Lycoming County. LOCATION CONFLICT: not accepted as confirmed Bradford-site evidence."
    },
    {
      "id": "A-O",
      "title": "Howard County Alpha Ridge official page",
      "url": "https://www.howardcountymd.gov/bureau-environmental-services/alpha-ridge-landfill",
      "publicationDate": null,
      "accessedDate": "2026-09-19",
      "basis": "Live primary page checked.",
      "scope": "Location, office contact, landfill history."
    },
    {
      "id": "A-H",
      "title": "Alpha Ridge gas-to-energy newsletter",
      "url": "https://www.howardcountymd.gov/alpha-ridge-landfill/resource/newsletter-nov-2011",
      "publicationDate": "2011-11",
      "accessedDate": "2026-09-19",
      "basis": "Historical county project document checked; search indexing date ignored.",
      "scope": "Design-stage generator, compressor, onsite consumption and sale concept."
    },
    {
      "id": "A-D",
      "title": "Howard County 2025–2034 Solid Waste Management Plan, CR143-2025",
      "url": "https://cc.howardcountymd.gov/sites/default/files/2025-07/CR143-2025.pdf",
      "publicationDate": "2025-07",
      "accessedDate": "2026-09-19",
      "locator": "Printed page 83 / zero-based PDF index 87 (physical PDF page 88); section 4.7.3, with MDE-approval condition on preceding page",
      "basis": "County plan PDF text checked.",
      "scope": "Anticipated generator decommissioning during planning period subject to MDE approval; not proof decommissioning already occurred."
    },
    {
      "id": "S-O",
      "title": "SECCRA RNG partnership announcement",
      "url": "https://seccra.org/whats-happening/2024/12/19/seccra-partners-with-waga-energy-to-convert-landfill-gas-into-renewable-natural-gas",
      "publicationDate": "2024-12-19",
      "accessedDate": "2026-09-19",
      "basis": "Owner announcement checked.",
      "scope": "Plan to replace aging electricity generation with RNG."
    },
    {
      "id": "S-W",
      "title": "Waga Energy SECCRA project agreement release",
      "url": "https://waga-energy.com/wp-content/uploads/2024/12/2024-18-12_RNG_SECCRA_WagaEnergy_US.pdf",
      "publicationDate": "2024-12-18",
      "accessedDate": "2026-09-19",
      "basis": "Historical research citation. Source link returned HTTP 404 during review on 2026-09-19; unavailable for independent rechecking.",
      "scope": "20-year agreement; Waga to finance, build, own and operate RNG plant; commissioning then expected 2026. No current commissioning confirmation.",
      "accessStatus": "unavailable-404",
      "accessNote": "Source S-W returned HTTP 404 during review on 2026-09-19; its reported agreement terms could not be independently rechecked from that link. The dated owner announcement still supports the RNG-transition concern. Commissioning status is unconfirmed."
    },
    {
      "id": "S-H",
      "title": "SECCRA gas monitoring and power page",
      "url": "https://seccra.org/gas-monitoring-and-control",
      "publicationDate": null,
      "accessedDate": "2026-09-19",
      "basis": "Owner page checked.",
      "scope": "Undated page says approximately 2.4 MW/full operation; conflicts with later dated RNG replacement announcement."
    }
  ],
  "presentationVersion": "PM-SCOUTING-PUBLIC-v1",
  "isSample": true,
  "inventoryStatus": "research-example-only",
  "sampleLabel": "Public research example · no available power or price confirmed"
};
