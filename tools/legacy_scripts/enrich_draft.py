import csv, re

top30 = {
"Gavin McKenna": ("Elite Playmaker", "A, 2G+A, SOG, Cor", "The consensus #1 pick with elite vision and passing -- expect heavy assist totals and multi-point games as a future PP1 driver. Shot volume and Corsi will be excellent at the NHL level."),
"Ivar Stenberg": ("Playmaker", "A, 2G+A, Cor, TK/GV", "William Nylander comp with a two-way transition game and elite timing; assists and multi-point games will come in bunches as a PP contributor with strong Corsi and TK/GV."),
"Keaton Verhoeff": ("Offensive D", "SOG, Blk, A, Cor", "Elite-sized two-way D projected as a top-pair anchor; heavy shot from the point and proactive defensive instincts generate blocked shots and SOG with PP assist upside."),
"Chase Reid": ("Offensive D", "SOG, A, 2G+A, Cor", "Dynamic puck-carrying defenseman and top play-driver in the class; high shot volume and multi-point games from power play deployment make him a premier fantasy D-man."),
"Alberts Smits": ("Offensive D", "SOG, A, Blk, Cor", "Big-bodied Liiga D with a heavy point shot and elite PP one-timer; shot-happy tendency translates directly to SOG totals with puck-moving skill adding assist and Corsi value."),
"Caleb Malhotra": ("Two-Way C", "A, G, 2G+A, TK/GV", "The draft's top center (84 OHL pts) combines top-six scoring with elite defensive instincts -- multi-point capacity and takeaway value project well to fantasy across all deployment situations."),
"Tynan Lawrence": ("Two-Way C", "TK/GV, A, Cor, Blk", "Explosive two-way center whose standout skill is pick-pocketing opponents in transition; trusted in all situations including PK. Takeaways and Corsi are the primary fantasy categories."),
"Carson Carels": ("Offensive D", "A, SOG, Cor, Blk", "Elite-skating offensive D with a 20-goal OHL season; combination of shot generation and puck distribution make him a fantasy gold mine for SOG, assists, and Corsi from the point."),
"Ethan Belchetz": ("Power Forward", "G, Hit, PIM, SOG", "6-foot-5 Tom Wilson comp with surprisingly elite hands (34 OHL goals); hits and PIM accumulate naturally while net-front presence drives goals and multi-point games."),
"Viggo Bjorck": ("Two-Way C", "A, TK/GV, Cor, Blk", "Cerebral two-way center who earned top-six and PK time in the SHL at 17; elite stick-checking and breakout skill produce TK/GV and Corsi alongside playmaking assists."),
"Daxon Rudolph": ("Offensive D", "SOG, A, 2G+A, PIM", "Rare offensive D-man who also dominates 1-on-1 defensively; led WHL D-men in scoring (40 pts) plus 75 PIM. SOG, PIM, and multi-point production give him a unique fantasy profile."),
"Ryan Lin": ("Offensive D", "A, SOG, Cor, 2G+A", "Dynamic blueline creator who led Vancouver Giants in scoring (50 pts); high hockey IQ and PP deployment translate to power-play assists, strong SOG totals, and elite Corsi numbers."),
"Oscar Hemming": ("Power Forward", "G, SOG, Hit, 2G+A", "6-foot-4 Finnish power forward with an NHL-ready wrist shot who dominates slot and net-front areas; physical game generates hits naturally while goals and SOG are the core fantasy output."),
"Adam Novotny": ("Sniper", "G, SOG, 2G+A, A", "Czech winger posted 34 OHL goals with a dangerous quick-release wrister; goals and SOG are the primary fantasy output with multi-point games coming from PP deployment."),
"Oliver Suvanto": ("Two-Way C", "G, Hit, Blk, A", "6-foot-3 Tappara center (Anton Lundell comp) who screens, deflects, and generates rebounds for goals with heavy frame; PK deployment adds blocked shot value."),
"Xavier Villeneuve": ("Offensive D", "A, SOG, 2G+A, Cor", "Lane Hutson comp with elite agility and the shiftiest hands of any D in the class; projects as a top-10 fantasy defenseman for assists, SOG, and possession metrics as a PP quarterback."),
"Malte Gustafsson": ("Two-Way D", "Blk, TK/GV, Cor, A", "Big (6-foot-4) Swedish D who excels in gap control and lane disruption; fantasy value concentrated in blocked shots, Corsi, and takeaways with limited but real assist upside."),
"Elton Hermansson": ("Skilled Winger", "G, A, SOG, Cor", "Mid-range pick with sharp edgework, a powerful accurate shot, and strong hockey sense; projects as a reliable middle-six forward contributing goals, assists, and positive possession metrics."),
"Marcus Nordmark": ("Skilled Winger", "G, A, 2G+A, SOG", "Led Hlinka-Gretzky in scoring; 6-foot-2 frame allows puck protection and creativity -- balanced goal-scoring and playmaking produce multi-point games with SOG as a natural byproduct."),
"Ilya Morozov": ("Two-Way C", "Blk, TK/GV, Hit, Cor", "6-foot-3 defensive-zone specialist trusted on the PK at 17; dominant board battles and positioning produce hits, blocked shots, and takeaways -- offensive ceiling limits G/A upside."),
"Nikita Klepov": ("Elite Playmaker", "A, G, 2G+A, SOG", "Led OHL scoring as a rookie with elite vision and dangerous quick-release; assists and multi-point games are the dominant fantasy categories with strong shot volume."),
"JP Hurlbert": ("Sniper", "G, SOG, 2G+A, A", "WHL co-leading scorer (50 pts, 22G) with a catch-and-release shot that reads as NHL-caliber; goals and SOG are the primary fantasy drivers with multi-point game upside."),
"Juho Piiparinen": ("Defensive D", "Blk, TK/GV, Cor, Hit", "Tappara's defensive-minded D projects as a top-four shutdown blueliner; elite positioning and stick-checking make him a Blk/TK/GV/Cor specialist -- fantasy value is in peripheral categories."),
"Mathis Preston": ("Skilled Winger", "G, SOG, A, Cor", "Phil Kessel comp who blazes the wing and fires with accuracy; elite skating and dangerous shot generation project him as a top-six winger. Goals and SOG are the core fantasy value."),
"William Hakansson": ("Two-Way D", "A, Blk, Cor, TK/GV", "Big (6-foot-4) SHL D-man with high-IQ puck movement and elite breakout ability; fantasy value centers on Corsi, assists, and defensive stats rather than scoring."),
"Wyatt Cullen": ("Skilled Winger", "G, A, SOG, 2G+A", "NTDP top scorer with a precise heavy release and lightning hands; two-way offensive driver who produces in all situations. Goals, SOG, and multi-point games are the fantasy targets."),
"Yegor Shilov": ("Playmaker", "A, 2G+A, Cor, TK/GV", "Cerebral QMJHL playmaker (53 pts) with elite vision and puck manipulation; PLC Dubois comp. Assists and multi-point games driven by PP usage with TK/GV added from forechecking sequences."),
"Ryan Roobroeck": ("Power Forward", "G, SOG, Hit, PIM", "Physically imposing (6-foot-4, 216 lbs) power forward with a heavy NHL-caliber shot; goals, SOG, hits, and PIM translate well to fantasy if his compete level matches his physical tools."),
"Alexander Command": ("Two-Way C", "A, Cor, TK/GV, 2G+A", "Creative Swedish center built on playmaking and transition sequences; Elias Lindholm comp projects as a reliable two-way middle-six center with steady assists and positive possession."),
"Maddox Dagenais": ("Power Forward", "G, SOG, Hit, 2G+A", "6-foot-4 QMJHL power forward with a powerful one-timer and PP dominance; goals and SOG from power play deployment are the fantasy anchor with hits as a natural physical bonus."),
}

def classify(row):
    pos = row['Pos']
    try: gp = int(row['GP'])
    except: gp = 0
    try: g = int(row['G'])
    except: g = 0
    try: a = int(row['A'])
    except: a = 0
    try: pts = int(row['Pts'])
    except: pts = 0
    try: rank = int(row['Rank'])
    except: rank = 99
    m = re.search(r'\s(\d{2,3})$', row.get('Size',''))
    weight = int(m.group(1)) if m else 180

    if pos == 'G':
        if rank <= 70:
            return ("Starting G Upside", "W, SV%, SHO, GAA",
                "Projects as a potential NHL starter; W, SV%, SHO, and GAA provide full fantasy contribution when earning a starting job.")
        return ("Backup G", "W, SV%",
            "Projects as a depth/backup option; W and SV% provide limited fantasy value dependent on deployment.")

    g_ratio = g / pts if pts > 0 else 0.4
    gpg = g / gp if gp > 0 else 0

    if 'D' in pos:
        if gpg >= 0.13 or (g >= 5 and gp >= 28):
            return ("Offensive D", "A, SOG, Cor",
                "Offense-first defenseman who projects as a PP quarterback; strong assist totals and shot volume from the point with positive Corsi from puck-moving ability.")
        elif gpg >= 0.05 or (a >= 7 and gp >= 25):
            return ("Two-Way D", "A, Blk, TK/GV, Cor",
                "Reliable two-way defenseman who contributes on both ends; assist upside complemented by blocks, takeaways, and positive Corsi from zone-entry and breakout skills.")
        return ("Defensive D", "Blk, TK/GV, Cor",
            "Defensive specialist with limited offensive ceiling; fantasy value concentrated in blocked shots, takeaways, and possession metrics.")

    if g_ratio >= 0.52:
        if weight >= 205:
            return ("Power Forward", "G, Hit, PIM, SOG",
                "Physical goal-scoring forward who projects for goals, shots, hits, and PIM -- a rare combination of offensive and physical fantasy value.")
        return ("Sniper", "G, SOG, 2G+A",
            "Goal-scoring specialist with an elite shot; projects to lead his line in goals and SOG with multi-point game upside from PP deployment.")
    elif g_ratio <= 0.38:
        if weight >= 205:
            return ("Power Forward", "G, Hit, PIM, A",
                "Physical playmaking power forward who generates assists and goals while contributing hits and PIM naturally from physical style of play.")
        return ("Playmaker", "A, G, 2G+A",
            "Playmaking forward whose elite vision and passing will produce assists and multi-point games; projects as a PP contributor with strong fantasy assist upside.")
    else:
        if weight >= 215:
            return ("Power Forward", "G, Hit, PIM, SOG",
                "Power forward who contributes goals alongside physical stats; hits and PIM accumulate naturally from physical style of play.")
        if weight >= 198:
            return ("Skilled Winger", "G, A, Hit, SOG",
                "Big-bodied skilled forward who contributes offensively and adds some physicality; goals, assists, and shot totals are the core fantasy value.")
        return ("Skilled Winger", "G, A, SOG",
            "Skilled two-way forward with balanced offensive production; contributes goals, assists, and shot totals with good hockey sense.")

rows = []
with open('prospect-app/draft_2026.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = list(reader.fieldnames) + ['Style', 'Fantasy_Cats', 'Scouting_Note']
    for row in reader:
        player = row['Player']
        if player in top30:
            st, fc, sn = top30[player]
        else:
            st, fc, sn = classify(row)
        row['Style'] = st
        row['Fantasy_Cats'] = fc
        row['Scouting_Note'] = sn
        rows.append(row)

with open('prospect-app/draft_2026.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Done: {len(rows)} players written")
for r in rows[:5]:
    print(f"  {r['Rank']}. {r['Player']} | {r['Style']} | {r['Fantasy_Cats']}")
