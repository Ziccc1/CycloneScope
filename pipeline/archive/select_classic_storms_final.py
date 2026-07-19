"""Final A3 selection: exactly five WP cases, four Taiwan-focused plus Haiyan."""
from select_classic_storms import main
import select_classic_storms

select_classic_storms.SELECTED = [
    "1980214N11330", "1988253N12306", "2005236N23285", "2017260N12310",  # NA
    "2015293N13266",  # EP
    "2008117N11090",  # NI
    "2019063S18038", "2023036S12117",  # SI
    "2011028S13180", "2014004S17183",  # SP
    "2009215N20133", "1996203N12152", "2010256N17137", "2015211N13162",  # WP Taiwan
    "2013306N07162",  # WP global high-impact reference
]

if __name__ == "__main__":
    raise SystemExit(main())
