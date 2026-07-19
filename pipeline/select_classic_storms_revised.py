"""Revised A3 selection: global comparison plus Taiwan-focused WP cases."""
from select_classic_storms import main
import select_classic_storms

select_classic_storms.SELECTED = [
    "1980214N11330",  # Allen / NA
    "1988253N12306",  # Gilbert / NA
    "2005236N23285",  # Katrina / NA
    "2017260N12310",  # Maria / NA
    "2015293N13266",  # Patricia / EP
    "2008117N11090",  # Nargis / NI
    "2019063S18038",  # Idai / SI
    "2023036S12117",  # Freddy / SI
    "2011028S13180",  # Yasi / SP
    "2014004S17183",  # Ian / SP
    "2009215N20133",  # Morakot / WP, Taiwan direct
    "1996203N12152",  # Herb / WP, Taiwan direct
    "2010256N17137",  # Fanapi / WP, Taiwan direct
    "2015211N13162",  # Soudelor / WP, Taiwan direct
    "2018250N12170",  # Mangkhut / WP, regional comparator
    "2013306N07162",  # Haiyan / WP, global high-impact reference
]

if __name__ == "__main__":
    raise SystemExit(main())
