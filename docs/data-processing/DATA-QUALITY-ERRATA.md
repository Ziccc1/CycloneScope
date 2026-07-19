# Data-quality review and explicit limitations

- TCE-DAT production files use DOI 10.5880/pik.2017.005 (CC BY 4.0). The collection DOI is not used as the file provenance.
- ERA5 capability: 16 classic cases are catalogued; 12 have at least one ERA5 field, while only the cases marked `has_dynamic=true` support animation.
- A7 64-point features: all emitted feature vectors have 64 points. Eleven global and one WP source tracks are retained in the QA list because their input quality/coverage fails the strict feature audit; they are not silently replaced.
- Official Taiwan population is dated 2024-12-01. 136,724 of 156,478 boundary features join directly; 19,754 remain boundary/version mismatches.
- Network service areas contain 15,088 official-population rows and 611 WorldPop fallback rows, distinguished by `population_reference`.
- The primary 22-zone WorldPop table remains a modeled 2025 exposure layer; it is not overwritten by official counts.
- Taiwan road network is derived from official road centerlines (dataset 73232), not the failed Geofabrik PBF transfer. Travel times use road-class default speeds where no speed limit is supplied.
