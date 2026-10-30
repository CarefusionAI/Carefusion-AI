CareFusion AI - full prototype export (synthetic demo data only)
================================================================

1) CareFusion-AI-All-Pages.pdf
   Every page and every app section in one PDF (150 screens), each with a title bar.

2) screenshots/
   The same 150 screens as full-length PNG images, grouped by site:
   Public site, Citizen app, Doctor app, Staff Portal, Admin Console.

3) site/  - the working, clickable prototype
   Windows : double-click START-Windows.bat
   Mac     : right-click START-Mac-Linux.command > Open
   Linux   : run ./START-Mac-Linux.command
   Your browser opens http://localhost:8080 with a list of all pages.
   Needs Python 3 installed (python.org) and internet for the fonts.
   Tip: open two apps in two tabs (e.g. Doctor and Pharmacist) - actions in
   one show up in the other ("Connected apps").

Note: site/support.js is a small local stand-in for the design canvas runtime,
so the pages behave the same as in the canvas but small visual differences
are possible. All names, IDs and health data are fictional.
