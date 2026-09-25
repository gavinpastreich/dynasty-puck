import csv

# Stock changes based on research
# Trend: "up_big", "up", "stable", "down", "down_big"
# Stock_Note: relevant context for dynasty owners

stock_updates = {
    "Gavin McKenna":     ("stable",   ""),
    "Ivar Stenberg":     ("stable",   "Representing Sweden at senior Worlds — strong showing further cements top-2 status and makes McKenna vs. Stenberg the draft's central debate."),
    "Keaton Verhoeff":   ("down",     "Skating concerns have grown among scouts — stride described as 'stiff' at NHL pace. Still a top-6 pick but has fallen from top-3 buzz of pre-season."),
    "Chase Reid":        ("stable",   ""),
    "Alberts Smits":     ("stable",   ""),
    "Caleb Malhotra":    ("up",       "Now consensus #1 center in the class after 29G/55A regular season plus 26 pts in 15 OHL playoff games. Some boards have him as high as 3rd overall."),
    "Tynan Lawrence":    ("stable",   "Returned mid-season from lower-body injury and showed 10G/17 pts in 13 games. No long-term concern; elite two-way tools fully intact."),
    "Carson Carels":     ("stable",   ""),
    "Ethan Belchetz":    ("down",     "INJURY: Broke his left clavicle March 3, requiring surgery. Missed OHL playoffs and U18 Worlds. Expected healthy for Michigan State in fall. Dropped from potential top-5 to ~10-15 range."),
    "Viggo Bjorck":      ("up",       "Rose ~10 spots on multiple April boards. One of the youngest players seeing regular SHL top-six time and excelling. Dynasty ceiling is climbing."),
    "Daxon Rudolph":     ("stable",   ""),
    "Ryan Lin":          ("up",       "Returned from mid-season lower-body injury and led ALL defensemen at U18 Worlds with 6 points. Fully healthy; stock fully restored to first-round range."),
    "Oscar Hemming":     ("stable",   ""),
    "Adam Novotny":      ("stable",   ""),
    "Oliver Suvanto":    ("down",     "Disappointing U18 Worlds for Finland deepened offensive questions scouts already had. Fell 8+ spots from a pre-season top-10 projection to late first round."),
    "Xavier Villeneuve": ("down_big", "INJURY CONCERN: Has not played since January 4. Missed rest of season and playoffs. Size (5'11\", 157 lbs) combined with lengthy absence has some boards placing him outside Round 1 despite top-15 talent ceiling. Major draft-day risk."),
    "Malte Gustafsson":  ("stable",   ""),
    "Elton Hermansson":  ("stable",   ""),
    "Marcus Nordmark":   ("stable",   "Led Hlinka-Gretzky tournament in scoring. Stock remains firm."),
    "Ilya Morozov":      ("up",       "Rose to 8th among NA skaters on Central Scouting's final rankings — one of the biggest single-season climbs on the board. First-round lock; potential top-10."),
    "Nikita Klepov":     ("stable",   ""),
    "JP Hurlbert":       ("down",     "Blazers swept in first round, Hurlbert had just 3 points in 4 playoff games. Scouts flagging pace-of-play concerns. Still a probable first-round pick but no longer a certainty."),
    "Juho Piiparinen":   ("stable",   ""),
    "Mathis Preston":    ("down",     "INJURY: Suffered 8-week lower-body injury mid-season. Returned for U18 Worlds (6 pts, Canada's best forward) which is helping rebuild stock. Dynasty value intact but fell from top-8 projection to ~20-30 range."),
    "William Hakansson": ("down_big", "Fell 14 spots on Upside Hockey's April board. Scouts now profile him more as a shutdown D than a two-way offensive driver. Size coveted but offensive ceiling concerns are mounting."),
    "Wyatt Cullen":      ("up_big",   "The biggest riser in the entire 2026 class. Went from unranked/C-grade pre-season to top-10 lock. Led USA with 9 pts in 5 U18 Worlds games. Some scouts project him top-5. Dynasty value has skyrocketed."),
    "Yegor Shilov":      ("stable",   ""),
    "Ryan Roobroeck":    ("down_big", "Has fallen drastically — outside first round on multiple boards after missing significant time to injury and failing to live up to top-center-in-the-class pre-season billing. Malhotra, Carels, and others now clearly ahead."),
    "Alexander Command": ("stable",   ""),
    "Maddox Dagenais":   ("stable",   ""),
    "Tommy Bleyl":       ("up_big",   "One of the most dramatic single-season ascents in the class. Rose from C-grade pre-season (Round 4-5 projection) to Central Scouting's 17th-ranked NA skater. Set QMJHL records for points by a rookie defenseman (13G/68A). First-round candidate."),
}

# New player to add
new_player = {
    "Rank": "47",
    "Player": "Ripa Zajic",
    "Pos": "C/RW",
    "Nationality": "SVK",
    "League": "NTDP (USHL)",
    "GP": "33",
    "G": "11",
    "A": "15",
    "Pts": "26",
    "NHLe": "12.4",
    "Size": "5'11 181",
    "Fantasy_Tier": "Rd 1-2",
    "Style": "Skilled Winger",
    "Fantasy_Cats": "G, A, SOG, TK/GV",
    "Scouting_Note": "The biggest U18 Worlds stock-booster not already on most dynasty lists: 5 goals in 5 games for Slovakia including a hat trick vs. Germany. Fast, competitive, defensively sound — scouts who doubted his offensive ceiling all season had their concerns erased at the tournament.",
    "Trend": "up_big",
    "Stock_Note": "U18 WORLDS BREAKOUT: Exploded with 5G/5GP for Slovakia, vaulting from projected rounds 3-5 to late first/early second round conversation. The defining riser from the U18 tournament. Add to dynasty watchlist immediately.",
}

rows = []
with open('prospect-app/draft_2026.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = list(reader.fieldnames)
    if 'Trend' not in fieldnames:
        fieldnames.append('Trend')
    if 'Stock_Note' not in fieldnames:
        fieldnames.append('Stock_Note')

    for row in reader:
        player = row['Player']
        if player in stock_updates:
            trend, note = stock_updates[player]
            row['Trend'] = trend
            row['Stock_Note'] = note
        else:
            row['Trend'] = 'stable'
            row['Stock_Note'] = ''
        rows.append(row)

# Insert Ripa Zajic after rank 46
insert_idx = next((i for i, r in enumerate(rows) if int(r['Rank']) >= 47), len(rows))
new_row = {k: '' for k in fieldnames}
new_row.update(new_player)
rows.insert(insert_idx, new_row)

# Ensure all rows have both new columns
for row in rows:
    if 'Trend' not in row:
        row['Trend'] = 'stable'
    if 'Stock_Note' not in row:
        row['Stock_Note'] = ''

with open('prospect-app/draft_2026.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

# Summary
trends = [r['Trend'] for r in rows]
print(f"Updated {len(rows)} players (including Ripa Zajic)")
print(f"  up_big: {trends.count('up_big')}")
print(f"  up:     {trends.count('up')}")
print(f"  stable: {trends.count('stable')}")
print(f"  down:   {trends.count('down')}")
print(f"  down_big: {trends.count('down_big')}")
print("Key movers:")
for r in rows:
    if r['Trend'] in ('up_big','down_big','up','down') and r['Stock_Note']:
        print(f"  {r['Trend'].upper()}: {r['Player']} (#{r['Rank']})")
