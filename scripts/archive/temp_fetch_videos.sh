#!/bin/bash

# List of YouTube video IDs
videos=(
    "86-7Dr7yeVQ"
    "2UJDLWcSADk"
    "XjhxRZEm638"
    "dMr-Jt_K3Cc"
    "n49L-PpC0Wg"
    "9SLt3AT0rXk"
    "TmtVbezZaqg"
    "YuvgiDTzxhU"
    "ahSMyLJcp48"
    "kC6_JqEt3GA"
    "g9Y-Bkq5O0Q"
    "MwcqP3ta6RI"
    "wgkdREYOfw0"
    "xsRDTfuksyI"
    "V_I168MM-ik"
    "-FguEt6H91s"
    "O52zDyxg5QI"
    "ZHtA91NVHdw"
    "L3iKvwoXZ38"
    "yDKJMdZTEXQ"
    "0sK1F-jaOsE"
    "Zot8ShPuuKg"
    "Y2VfyLoTO0c"
    "jtLh8BdmHUU"
    "LUNTLTVKScY"
    "VhVgZi2lGv0"
    "J0H-rJrvzNU"
    "teGLziUvDkI"
    "8ySM57gHETU"
    "oylWJ-f3S5U"
    "wShzNJhnBbU"
    "xpFB6aUuFso"
    "KdXa0xp7jLs"
    "dnlQtDad6Dk"
    "xHLEKR3_8iI"
    "Vt1U_SEDeGk"
    "otxfXolN6Mg"
    "o4fKtgPVpoU"
    "f43H3pS3l50"
    "dFBRpHHwQeg"
    "qJ8lYplu1y0"
    "UBmDO9jqrBo"
    "YQIAEj9cx1s"
)

echo "video_id|title|channel|channel_url"

for video_id in "${videos[@]}"; do
    echo "Fetching $video_id..." >&2
    result=$(yt-dlp --skip-download --print "%(id)s|%(title)s|%(channel)s|%(channel_url)s" "https://www.youtube.com/watch?v=$video_id" 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "$result"
    else
        echo "$video_id|ERROR|ERROR|ERROR"
    fi
    sleep 1  # Be nice to YouTube
done
