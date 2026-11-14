"""URLs of every external dataset the pipeline touches (see docs/SOURCES.md)."""

PGDA90 = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
PGDA78 = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
LROC_PDS = "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001"
DIVINER_PRP = "https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp"
LOLA_CYL = "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG"
SLDEM_TILES = "https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG"
HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Product-78 5 m site DEMs that contain a curated site's coordinates or representative point.
# Site20v2 is the 2022 extended version of Site20 (same centre), used for Mons Mouton.
SITES_5M = ["Haworth", "Site23", "Site06", "DM2", "Site20v2"]
# slope comes from PGDA product 90 LDRM (100 m plane fit), so _slp/_slperr are not needed
SITE_5M_SUFFIXES = ["surf", "toterr"]

WHOLE_FILES: list[tuple[str, str]] = [
    # (url, cache-relative path)
    (f"{PGDA90}/LDEM_60S_240MPP_ADJ.TIF", "pgda90/LDEM_60S_240MPP_ADJ.TIF"),
    (f"{PGDA90}/LDEM_60S_240MPP_ADJ_ERR.TIF", "pgda90/LDEM_60S_240MPP_ADJ_ERR.TIF"),
    (f"{PGDA90}/LDEM_80S_80MPP_ADJ.TIF", "pgda90/LDEM_80S_80MPP_ADJ.TIF"),
    (f"{PGDA90}/LDEM_80S_80MPP_ADJ_ERR.TIF", "pgda90/LDEM_80S_80MPP_ADJ_ERR.TIF"),
    (f"{PGDA90}/LDEM_80S_40MPP_ADJ.TIF", "pgda90/LDEM_80S_40MPP_ADJ.TIF"),
    (f"{PGDA90}/LDRM_80S_1000MPP_ADJ_SLP_100M.TIF", "pgda90/LDRM_80S_1000MPP_ADJ_SLP_100M.TIF"),
    (f"{PGDA90}/LDRM_80S_1000MPP_ADJ_ROUGH_100M.TIF", "pgda90/LDRM_80S_1000MPP_ADJ_ROUGH_100M.TIF"),
]
for ext in ["SHP", "SHX", "DBF", "PRJ"]:
    WHOLE_FILES.append((f"{PGDA90}/LPSR_80S_20MPP_ADJ_1km2.{ext}", f"pgda90/LPSR_80S_20MPP_ADJ_1km2.{ext}"))
    WHOLE_FILES.append((f"{PGDA90}/LPSR_80S_20MPP_ADJ.{ext}", f"pgda90/LPSR_80S_20MPP_ADJ.{ext}"))
for s in SITES_5M:
    for suf in SITE_5M_SUFFIXES:
        WHOLE_FILES.append((f"{PGDA78}/{s}/{s}_final_adj_5mpp_{suf}.tif", f"pgda78/{s}_final_adj_5mpp_{suf}.tif"))
WHOLE_FILES += [
    (f"{LROC_PDS}/EXTRAS/SHAPEFILE/ANTHROPOGENIC_OBJECTS/ANTHROPOGENIC_OBJECTS_180.ZIP", "lroc/ANTHROPOGENIC_OBJECTS_180.ZIP"),
    (f"{LROC_PDS}/EXTRAS/BROWSE/WAC_POLE/WAC_POLE_ILL_PCT_SOUTH/WAC_POLE_ILL_PCT_SOUTH_100M.TIF", "lroc/WAC_POLE_ILL_PCT_SOUTH_100M.TIF"),
    (f"{LROC_PDS}/EXTRAS/BROWSE/WAC_POLE/WAC_POLE_ILL_TWI_SOUTH/WAC_POLE_ILL_TWI_SOUTH_100M.TIF", "lroc/WAC_POLE_ILL_TWI_SOUTH_100M.TIF"),
    (f"{LROC_PDS}/DATA/BDR/WAC_POLE/WAC_POLE_ILL_PCT_SOUTH/WAC_POLE_ILL_PCT_SOUTH_README.TXT", "lroc/WAC_POLE_ILL_PCT_SOUTH_README.TXT"),
    (f"{LROC_PDS}/DATA/BDR/WAC_POLE/WAC_POLE_ILL_PCT_SOUTH/WAC_POLE_ILL_PCT_SOUTH_100M.IMG", "lroc/WAC_POLE_ILL_PCT_SOUTH_100M.IMG"),
    (f"{DIVINER_PRP}/dlre_prp_south.xml", "diviner/dlre_prp_south.xml"),
    (f"{DIVINER_PRP}/dlre_prp_south.tab", "diviner/dlre_prp_south.tab"),
]

# Read by HTTP range (COG windows via GDAL /vsicurl/, or raw-tile byte ranges). Not downloaded whole.
RANGE_READ = {
    "LDEM_80S_20MPP_ADJ": (f"{PGDA90}/LDEM_80S_20MPP_ADJ.TIF", "COG; ~±8 km near-field windows for polar sites outside 5 m boxes"),
    "LDEM_80S_20MPP_ADJ_ERR": (f"{PGDA90}/LDEM_80S_20MPP_ADJ_ERR.TIF", "COG; height error at polar sites"),
    "LDSM_80S_20MPP_ADJ_ERR": (f"{PGDA90}/LDSM_80S_20MPP_ADJ_ERR.TIF", "COG; slope error at polar sites"),
    "LDRM_80S_50MPP_ADJ_SLP_100M": (f"{PGDA90}/LDRM_80S_50MPP_ADJ_SLP_100M.TIF", "COG; 100 m-baseline plane-fit slope at polar sites"),
    "LDRM_80S_50MPP_ADJ_ROUGH_100M": (f"{PGDA90}/LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF", "COG; 100 m-baseline roughness at polar sites"),
    "LDEM_60S_60MPP_ADJ": (f"{PGDA90}/LDEM_60S_60MPP_ADJ.TIF", "COG; near/mid-field windows for 60-80°S sites"),
    "LDEM_60S_60MPP_ADJ_ERR": (f"{PGDA90}/LDEM_60S_60MPP_ADJ_ERR.TIF", "COG; height error for 60-80°S sites"),
    "SLDEM2015_512_TILES": (f"{SLDEM_TILES}/", "raw float32 tiles (km, offset 1737.4); row-block range reads for ±60° sites"),
    "LDEM_64": (f"{LOLA_CYL}/LDEM_64.IMG", "LOLA GDR 64 ppd int16 global image; row-wise multi-range reads for the non-polar far field"),
    "LDEM_512_45N_90N": (f"{LOLA_CYL}/", "LOLA GDR 512 ppd 45-90N tiles; near field north of 60N"),
    "HORIZONS": (HORIZONS_API, "JPL Horizons API; sequential, disk-cached queries"),
}

DIVINER_PRP_URL = f"{DIVINER_PRP}/dlre_prp_south.tab"
