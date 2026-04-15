library(shiny)
library(DT)
library(dplyr)
library(readr)
library(stringr)
library(httr)
library(jsonlite)

# ── Projected contract model constants ──
SALARY_CAP <- 104000000  # 2026-27 projected cap
N_TEAMS <- 14
ROSTER_SIZE <- 23
# Score-to-salary model derived from league data:
# Tier avg scores: $1M-2.49M=54.8, $2.5M-3.99M=59.9, $4M-6.49M=65.9, $6.5M-8.99M=69.4, $9M-12.5M=75.2, $12.5M+=83.7
# Age discount: younger players get dynasty premium (peak 24-28, decline after 30)

project_salary <- function(score, age, pos) {
  # Base salary from score (piecewise linear model fit to league data)
  base <- case_when(
    score >= 90 ~ 13000000 + (score - 90) * 440000,
    score >= 80 ~ 10500000 + (score - 80) * 250000,
    score >= 70 ~ 7500000 + (score - 70) * 300000,
    score >= 60 ~ 4500000 + (score - 60) * 300000,
    score >= 50 ~ 2500000 + (score - 50) * 200000,
    score >= 40 ~ 1500000 + (score - 40) * 100000,
    score >= 25 ~ 1000000 + (score - 25) * 33333,
    TRUE ~ 1000000
  )
  # Dynasty age multiplier: prime=24-28, young premium, old discount
  age_mult <- case_when(
    is.na(age) ~ 1.0,
    age <= 21 ~ 1.20,  # youth premium
    age <= 23 ~ 1.12,
    age <= 28 ~ 1.0,   # prime
    age <= 30 ~ 0.90,
    age <= 32 ~ 0.78,
    age <= 34 ~ 0.65,
    age <= 36 ~ 0.50,
    TRUE ~ 0.35
  )
  projected <- base * age_mult
  # Floor at $1M, cap at $17.5M
  pmin(17500000, pmax(1000000, round(projected, -4)))
}

value_rating <- function(actual, projected) {
  ratio <- actual / pmax(projected, 1)
  case_when(
    ratio <= 0.50 ~ "ELITE VALUE",
    ratio <= 0.70 ~ "Great Value",
    ratio <= 0.90 ~ "Good Value",
    ratio <= 1.10 ~ "Fair",
    ratio <= 1.30 ~ "Overpaid",
    ratio <= 1.60 ~ "Bad Value",
    TRUE ~ "TERRIBLE"
  )
}

project_contract_tier <- function(projected_sal) {
  case_when(
    projected_sal < 2500000 ~ "1 yr",
    projected_sal < 4000000 ~ "2 yr",
    projected_sal < 6500000 ~ "3 yr",
    projected_sal < 9000000 ~ "4 yr",
    projected_sal <= 12500000 ~ "5 yr",
    TRUE ~ "6 yr"
  )
}

# ── Age decay factors for contract value over time ──
age_decay_factor <- function(age) {
  case_when(
    is.na(age) ~ 1.0,
    age <= 27 ~ 1.02,
    age <= 29 ~ 0.98,
    age <= 31 ~ 0.94,
    age <= 33 ~ 0.88,
    TRUE ~ 0.80
  )
}

# ── Trade block classification ──
classify_trade_block <- function(value, age, contract_yrs) {
  case_when(
    value %in% c("ELITE VALUE", "Great Value") & age <= 25 & contract_yrs >= 3 ~ "Untouchable",
    value %in% c("ELITE VALUE", "Great Value") & age >= 29 & contract_yrs >= 3 ~ "Sell High",
    value %in% c("Overpaid", "Bad Value", "TERRIBLE") & age <= 25 ~ "Buy Low",
    value %in% c("Bad Value", "TERRIBLE") & age >= 30 & contract_yrs >= 3 ~ "Dead Weight",
    TRUE ~ NA_character_
  )
}

# ── Hockey Reference career GP scraping ──
fetch_career_gp_href <- function(player_name) {
  tryCatch({
    search_url <- paste0("https://www.hockey-reference.com/search/search.fcgi?search=", URLencode(player_name))
    res <- GET(search_url, timeout(10), add_headers(`User-Agent` = "Mozilla/5.0"))
    if(status_code(res) != 200) return(NA_integer_)
    html <- content(res, "text", encoding = "UTF-8")
    final_url <- res$url
    if(grepl("/players/", final_url)) return(parse_href_career_gp(html))
    player_links <- regmatches(html, gregexpr('/players/[a-z]/[a-z]+[0-9]+\\.html', html))[[1]]
    if(length(player_links) == 0) return(NA_integer_)
    res2 <- GET(paste0("https://www.hockey-reference.com", player_links[1]), timeout(10), add_headers(`User-Agent` = "Mozilla/5.0"))
    if(status_code(res2) != 200) return(NA_integer_)
    parse_href_career_gp(content(res2, "text", encoding = "UTF-8"))
  }, error = function(e) NA_integer_)
}

parse_href_career_gp <- function(html) {
  tfoot_match <- regmatches(html, regexpr('<tfoot>.*?</tfoot>', html, perl = TRUE))
  if(length(tfoot_match) > 0 && nchar(tfoot_match) > 0) {
    gp_matches <- regmatches(tfoot_match, gregexpr('data-stat="games_played"[^>]*>([0-9]+)<', tfoot_match, perl = TRUE))[[1]]
    if(length(gp_matches) > 0) {
      gp_val <- regmatches(gp_matches[1], regexpr('[0-9]+', gp_matches[1]))
      return(as.integer(gp_val))
    }
  }
  NA_integer_
}

ui <- fluidPage(
  tags$head(tags$style(HTML("
    body{background:#0e1117;color:#c9d1d9;font-family:'Segoe UI',sans-serif;overflow-x:hidden}
    .container-fluid{max-width:1500px}

    .app-header{background:linear-gradient(135deg,#1a1f2e 0%,#0d2137 50%,#1a1520 100%);border-bottom:3px solid #f0883e;padding:22px 28px;margin-bottom:22px;border-radius:0 0 12px 12px;position:relative;overflow:hidden}
    .app-header::after{content:'';position:absolute;top:0;left:-50%;width:200%;height:100%;background:linear-gradient(90deg,transparent,rgba(240,136,62,.04),transparent);animation:headerShimmer 8s ease infinite}
    @keyframes headerShimmer{0%,100%{transform:translateX(-30%)}50%{transform:translateX(30%)}}
    .app-header h2{color:#f0883e;margin:0 0 4px 0;font-size:1.7em;font-weight:700;letter-spacing:-.02em}
    .app-header p{color:#8b949e;margin:0;font-size:.9em}

    .nav-tabs{border-bottom:2px solid #21262d;display:flex;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#30363d transparent;white-space:nowrap}
    .nav-tabs::-webkit-scrollbar{height:4px}.nav-tabs::-webkit-scrollbar-track{background:transparent}.nav-tabs::-webkit-scrollbar-thumb{background:#30363d;border-radius:2px}
    .nav-tabs>li{flex-shrink:0}.nav-tabs>li>a{color:#8b949e;background:transparent;border:none;transition:all .2s ease;padding:10px 14px;font-size:.88em;white-space:nowrap}
    .nav-tabs>li.active>a,.nav-tabs>li.active>a:hover,.nav-tabs>li.active>a:focus{color:#f0883e;background:#161b22;border:none;border-bottom:3px solid #f0883e}
    .nav-tabs>li>a:hover{color:#c9d1d9;background:#161b22;border:none;transform:translateY(-1px)}

    .well{background:#161b22;border:1px solid #21262d;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    .form-control,select{background:#0d1117!important;color:#c9d1d9!important;border:1px solid #30363d!important;border-radius:6px!important;transition:border-color .2s}
    .form-control:focus,select:focus{border-color:#f0883e!important;box-shadow:0 0 0 3px rgba(240,136,62,.15)!important}
    label{color:#8b949e;font-size:.85em;text-transform:uppercase;letter-spacing:.03em}
    .btn-default{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;transition:all .2s}
    .btn-default:hover{background:#30363d;color:#f0883e;border-color:#f0883e;transform:translateY(-1px);box-shadow:0 3px 8px rgba(240,136,62,.15)}

    table.dataTable{color:#c9d1d9!important;border-collapse:separate;border-spacing:0}
    table.dataTable thead th{background:#161b22!important;color:#f0883e!important;border-bottom:2px solid #30363d!important;font-size:.85em;text-transform:uppercase;letter-spacing:.03em}
    table.dataTable tbody tr{background:#0d1117!important;transition:all .15s ease}
    table.dataTable tbody tr:hover{background:#161b22!important;box-shadow:inset 3px 0 0 #f0883e}
    table.dataTable tbody tr.selected{background:#1c3a5c!important;box-shadow:inset 3px 0 0 #58a6ff}
    table.dataTable tbody td{border-color:#21262d!important;padding:10px 12px!important}
    .dataTables_wrapper .dataTables_filter input,.dataTables_wrapper .dataTables_length select{background:#0d1117!important;color:#c9d1d9!important;border:1px solid #30363d!important;border-radius:6px!important}
    .dataTables_wrapper .dataTables_info,.dataTables_wrapper .dataTables_length label,.dataTables_wrapper .dataTables_filter label{color:#8b949e!important}
    .dataTables_wrapper .dataTables_paginate .paginate_button{color:#8b949e!important;border-radius:4px!important;transition:all .15s}
    .dataTables_wrapper .dataTables_paginate .paginate_button.current{color:#f0883e!important;background:#161b22!important;border:1px solid #f0883e!important}
    .dataTables_wrapper .dataTables_paginate .paginate_button:hover{color:#f0883e!important;background:#21262d!important}

    .player-card{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    @keyframes cardSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .player-card h3{color:#f0883e;margin-top:0;font-size:1.3em;font-weight:700}.player-card .meta{color:#8b949e;margin-bottom:14px;font-size:.9em}
    .link-btn{display:inline-block;margin:4px 6px 4px 0;padding:7px 16px;background:#21262d;color:#58a6ff;border-radius:8px;font-size:.85em;border:1px solid #30363d;cursor:pointer;transition:all .2s ease;user-select:none}
    .link-btn:hover{background:#30363d;color:#79c0ff;transform:translateY(-2px);box-shadow:0 4px 12px rgba(88,166,255,.15);border-color:#58a6ff}
    .link-btn:active{transform:translateY(0)}
    .link-section{margin-bottom:10px}.link-section h4{color:#8b949e;font-size:.8em;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}

    .browser-bar{background:#161b22;border:1px solid #30363d;border-radius:10px 10px 0 0;padding:10px 16px;display:flex;align-items:center;gap:10px;margin-top:14px}
    .browser-bar .dots{display:flex;gap:6px}.browser-bar .dot{width:10px;height:10px;border-radius:50%}.dot-r{background:#f85149}.dot-y{background:#f0883e}.dot-g{background:#3fb950}
    .browser-bar .url-display{flex:1;background:#0d1117;color:#8b949e;border:1px solid #30363d;border-radius:6px;padding:6px 12px;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Consolas','Courier New',monospace}
    .browser-frame{border:1px solid #30363d;border-top:none;border-radius:0 0 10px 10px;width:100%;height:550px;background:white}
    .browser-placeholder{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:10px;padding:40px;text-align:center;color:#484f58;margin-top:14px;font-size:.95em}
    .browser-placeholder .icon{font-size:2em;margin-bottom:8px;opacity:.5}

    .badge-rfa{background:linear-gradient(135deg,#f0883e,#d97218);color:#0d1117;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em;letter-spacing:.02em}
    .badge-ufa{background:linear-gradient(135deg,#f85149,#da3633);color:#fff;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em;letter-spacing:.02em}
    .badge-locked{background:linear-gradient(135deg,#238636,#1a7f37);color:#fff;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em;letter-spacing:.02em}

    .needs-card{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    .needs-card h4{color:#f0883e;margin-top:0;font-weight:700}.needs-card .meta{color:#8b949e;margin-bottom:12px;font-size:.9em}
    .needs-row{padding:7px 0;border-bottom:1px solid #21262d;font-size:.9em;transition:background .15s}
    .needs-row:hover{background:rgba(240,136,62,.05);padding-left:6px}
    .need-urgent{color:#f85149;font-weight:bold}.need-moderate{color:#f0883e}.need-ok{color:#3fb950}
    .rec-section{margin-top:14px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:10px}
    .rec-section h5{color:#58a6ff;margin:0 0 10px;font-size:.92em;font-weight:600}

    .irs--shiny .irs-bar{background:linear-gradient(90deg,#f0883e,#d97218)}.irs--shiny .irs-handle{border:2px solid #f0883e;background:#161b22}
    .irs--shiny .irs-from,.irs--shiny .irs-to,.irs--shiny .irs-single{background:#f0883e;border-radius:4px}

    .shiny-busy .app-header::after{animation:headerShimmer 1s ease infinite!important}

    .stat-bar{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
    .stat-box{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:10px 16px;flex:1;min-width:120px;text-align:center}
    .stat-box .num{color:#f0883e;font-size:1.6em;font-weight:700;line-height:1.2}.stat-box .lbl{color:#8b949e;font-size:.75em;text-transform:uppercase;letter-spacing:.05em}

    .upload-section{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:16px}
    .upload-section h5{color:#f0883e;margin:0 0 10px;font-weight:600;font-size:.9em}
    .upload-section .form-group{margin-bottom:8px}

    .cat-rank{display:inline-block;width:26px;height:26px;border-radius:50%;text-align:center;line-height:26px;font-weight:700;font-size:.75em;margin-right:6px}
    .rank-1{background:#ffd700;color:#0d1117}.rank-2{background:#c0c0c0;color:#0d1117}.rank-3{background:#cd7f32;color:#0d1117}
    .rank-top5{background:#238636;color:#fff}.rank-mid{background:#21262d;color:#8b949e}.rank-bot5{background:#3d1418;color:#f85149}
    .cat-card{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease}
    .cat-card h4{color:#f0883e;margin-top:0;font-weight:700}
    .strength-tag{display:inline-block;padding:4px 12px;border-radius:6px;font-size:.8em;font-weight:600;margin:3px 4px 3px 0}
    .str-elite{background:linear-gradient(135deg,#ffd700,#f0883e);color:#0d1117}
    .str-strong{background:#238636;color:#fff}
    .str-avg{background:#21262d;color:#8b949e;border:1px solid #30363d}
    .str-weak{background:#3d2a0a;color:#f0883e}
    .str-crit{background:#3d1418;color:#f85149}
    .cat-heatmap td{padding:6px 10px!important;text-align:center;font-size:.85em}

    .val-elite{color:#ffd700;font-weight:700}.val-great{color:#3fb950;font-weight:700}.val-good{color:#58a6ff}
    .val-fair{color:#8b949e}.val-over{color:#f0883e}.val-bad{color:#f85149;font-weight:700}.val-terrible{color:#f85149;font-weight:700;text-decoration:underline}

    .proj-bar{height:6px;border-radius:3px;background:#21262d;margin:2px 0;position:relative}
    .proj-fill{height:100%;border-radius:3px}
    .proj-under{background:linear-gradient(90deg,#3fb950,#238636)}.proj-fair{background:#8b949e}.proj-over{background:linear-gradient(90deg,#f0883e,#f85149)}

    .cap-meter{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:16px}
    .cap-meter h5{color:#f0883e;margin:0 0 8px;font-weight:600;font-size:.9em}
    .cap-track{height:24px;background:#0d1117;border-radius:12px;overflow:hidden;position:relative}
    .cap-fill{height:100%;border-radius:12px;transition:width .4s}
    .cap-label{position:absolute;top:0;left:0;right:0;height:24px;line-height:24px;text-align:center;font-size:.8em;font-weight:600;color:#c9d1d9}

    .version-badge{display:inline-block;background:#f0883e;color:#0d1117;font-size:.6em;padding:1px 7px;border-radius:6px;vertical-align:super;margin-left:6px;font-weight:700;letter-spacing:.04em}

    .trade-compare-grid{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px}
    .trade-player-card{flex:1;min-width:220px;background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:18px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    .trade-player-card h4{color:#f0883e;margin:0 0 10px;font-weight:700;font-size:1.1em}
    .trade-stat-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #21262d;font-size:.88em}
    .trade-stat-row .stat-label{color:#8b949e}
    .trade-stat-row .stat-val{font-weight:600}
    .trade-winner{color:#3fb950!important}
    .trade-loser{color:#f85149!important}
    .trade-tie{color:#8b949e!important}
    .trade-verdict{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:20px;margin-top:16px;animation:cardSlideIn .3s ease}
    .trade-verdict h4{color:#f0883e;margin:0 0 10px;font-weight:700}
    .trade-verdict .verdict-text{font-size:1em;color:#c9d1d9;line-height:1.6}
    .dynasty-outlook{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;margin-top:10px}
    .dynasty-outlook h5{color:#58a6ff;margin:0 0 8px;font-size:.85em;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
    .dynasty-outlook .outlook-row{padding:3px 0;font-size:.85em;color:#8b949e}

    .power-rank-card{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:22px;margin-bottom:20px;animation:cardSlideIn .3s ease}
    .power-rank-card h4{color:#f0883e;margin:0 0 14px;font-weight:700}
    .pr-gold{background:rgba(255,215,0,.12)!important}
    .pr-silver{background:rgba(192,192,192,.10)!important}
    .pr-bronze{background:rgba(205,127,50,.10)!important}
    .pr-bottom{background:rgba(248,81,73,.08)!important}

    .app-footer{background:#161b22;border-top:2px solid #21262d;padding:14px 28px;text-align:center;color:#484f58;font-size:.82em;margin-top:28px;border-radius:12px 12px 0 0}

    .tab-overview-card{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:12px}
    .tab-overview-card h5{color:#f0883e;margin:0 0 6px;font-weight:600;font-size:.92em}
    .tab-overview-card p{color:#8b949e;margin:0;font-size:.82em}

    /* ═══ NEW: Signing Simulator styles ═══ */
    .sim-signing-item{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;animation:cardSlideIn .2s ease}
    .sim-signing-item .player-info{flex:1;font-size:.88em}
    .sim-signing-item .player-name{color:#c9d1d9;font-weight:600}
    .sim-signing-item .player-detail{color:#8b949e;font-size:.82em}
    .sim-remove-btn{background:#3d1418;color:#f85149;border:1px solid #f85149;border-radius:6px;padding:4px 10px;font-size:.78em;cursor:pointer;transition:all .2s}
    .sim-remove-btn:hover{background:#f85149;color:#fff}
    .sim-comparison{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px}
    .sim-col{flex:1;min-width:280px}
    .sim-section{background:#161b22;border:1px solid #21262d;border-radius:10px;padding:16px;margin-bottom:14px}
    .sim-section h5{color:#f0883e;margin:0 0 10px;font-weight:600;font-size:.9em}
    .sim-cat-row{display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #21262d;font-size:.85em}
    .sim-cat-row .cat-name{width:60px;color:#8b949e;font-weight:600}
    .sim-cat-row .rank-before{width:50px;text-align:center}
    .sim-cat-row .rank-arrow{width:40px;text-align:center;font-weight:700;font-size:1em}
    .sim-cat-row .rank-after{width:50px;text-align:center}
    .arrow-up{color:#3fb950}.arrow-down{color:#f85149}.arrow-same{color:#8b949e}

    /* ═══ NEW: Budget Planner styles ═══ */
    .budget-card{background:linear-gradient(135deg,#161b22,#1a1f2e);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease}
    .budget-card h4{color:#f0883e;margin-top:0;font-weight:700}
    .budget-tier-big{color:#3fb950;font-weight:700}.budget-tier-comfy{color:#58a6ff;font-weight:600}
    .budget-tier-tight{color:#f0883e;font-weight:600}.budget-tier-strapped{color:#f85149;font-weight:700}

    /* ═══ NEW: Trade Block styles ═══ */
    .tb-category{margin-bottom:20px}
    .tb-category h4{font-weight:700;margin:0 0 10px}
    .tb-sell-high{color:#ffd700}.tb-buy-low{color:#3fb950}.tb-dead-weight{color:#f85149}.tb-untouchable{color:#58a6ff}
    .tb-player-row{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 14px;margin-bottom:6px;font-size:.88em;display:flex;justify-content:space-between;align-items:center}
    .tb-player-row:hover{border-color:#30363d}
    .tb-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75em;font-weight:700;letter-spacing:.02em}
    .tb-badge-sell{background:#3d2a0a;color:#ffd700}
    .tb-badge-buy{background:#0a3d1a;color:#3fb950}
    .tb-badge-dead{background:#3d1418;color:#f85149}
    .tb-badge-untouchable{background:#1a2d4a;color:#58a6ff}

    /* ═══ NEW: Contract Value Over Time styles ═══ */
    .cvt-table{width:100%;border-collapse:collapse;margin-top:10px}
    .cvt-table th{background:#161b22;color:#f0883e;padding:6px 10px;font-size:.78em;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid #30363d}
    .cvt-table td{padding:6px 10px;border-bottom:1px solid #21262d;font-size:.85em;text-align:center}
    .cvt-surplus{color:#3fb950;font-weight:600}.cvt-deficit{color:#f85149;font-weight:600}
    .cvt-total{font-weight:700;font-size:.95em;padding:10px;margin-top:8px;border-radius:6px}

    /* ═══ RESPONSIVE: Mobile & iPad ═══ */
    @media(max-width:992px){
      .container-fluid{padding:0 8px}
      .app-header{padding:14px 16px;margin-bottom:14px}
      .app-header h2{font-size:1.2em}
      .app-header p{font-size:.75em}
      .nav-tabs>li>a{padding:8px 10px;font-size:.78em}
      .well{padding:12px}
      .stat-bar{gap:8px}
      .stat-box{min-width:80px;padding:8px 10px}
      .stat-box .num{font-size:1.2em}
      .stat-box .lbl{font-size:.65em}
      .player-card{padding:14px}
      .player-card h3{font-size:1.1em}
      .browser-frame{height:350px}
      .trade-compare-grid{flex-direction:column}
      .trade-player-card{min-width:unset}
      .sim-comparison{flex-direction:column}
      .sim-col{min-width:unset}
    }
    @media(max-width:768px){
      .col-sm-3,.col-sm-9,.col-md-3,.col-md-9,.col-sm-4,.col-md-4,.col-sm-8,.col-md-8,.col-sm-12,.col-md-12{width:100%!important;float:none!important;padding:0 8px!important}
      .app-header h2{font-size:1em}
      .app-header p{font-size:.7em}
      .stat-bar{gap:6px}
      .stat-box{min-width:60px;padding:6px 8px}
      .stat-box .num{font-size:1em}
      .link-btn{padding:5px 10px;font-size:.78em}
      .browser-bar{display:none}
      .browser-frame{border-radius:10px;height:300px}
      table.dataTable thead th{font-size:.72em;padding:6px 8px!important}
      table.dataTable tbody td{padding:6px 8px!important;font-size:.8em}
      .needs-row{font-size:.82em}
      .budget-card{padding:14px}
      .tb-player-row{flex-direction:column;align-items:flex-start;gap:4px}
      .sim-cat-row .cat-name{width:45px;font-size:.75em}
      .sim-cat-row .rank-before,.sim-cat-row .rank-after{width:35px}
      .sim-cat-row .rank-arrow{width:30px}
    }
    @media(max-width:480px){
      .app-header{padding:10px 12px;margin-bottom:10px}
      .app-header h2{font-size:.9em}
      .version-badge{font-size:.5em;padding:1px 5px}
      .stat-box{min-width:50px;padding:4px 6px}
      .stat-box .num{font-size:.9em}
      .stat-box .lbl{font-size:.6em}
      .well{padding:10px}
      .player-card{padding:10px}
      .link-btn{padding:4px 8px;font-size:.72em;margin:2px 3px 2px 0}
    }
  ")),
  tags$head(
    tags$meta(name="viewport", content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"),
    tags$meta(name="mobile-web-app-capable", content="yes"),
    tags$meta(name="apple-mobile-web-app-capable", content="yes"),
    tags$meta(name="apple-mobile-web-app-status-bar-style", content="black-translucent"),
    tags$meta(name="apple-mobile-web-app-title", content="Dynasty Puck FA"),
    tags$meta(name="theme-color", content="#0e1117"),
    tags$link(rel="manifest", href="manifest.json")
  )),

  div(class="app-header",
    h2(HTML("\U0001F3D2 Dynasty Puck \u2022 Offseason Planning HQ <span class='version-badge'>v3.2</span>")),
    p("Season 1 complete \u2022 Offseason FA & roster building \u2022 2026-27 projected cap: $104M \u2022 BID/FA contracts under $2.5M expire \u2022 Roster: 12F / 6D / 2G / 3 bench = 23 \u2022 ELC/MNR simulator support")),

  tabsetPanel(id="mainTabs",
    # ═══ DATA UPLOAD TAB ═══
    tabPanel("\U0001F4C1 Data Upload", fluidRow(
      column(4, div(class="upload-section",
        h5("\U0001F4C4 Upload Skater CSV"),
        fileInput("upload_skaters","Skater export (CSV)",accept=".csv"),
        p("Fantrax > Players > Skaters > Export CSV", style="color:#484f58;font-size:.8em;")
      )),
      column(4, div(class="upload-section",
        h5("\U0001F4C4 Upload Goalie CSV"),
        fileInput("upload_goalies","Goalie export (CSV)",accept=".csv"),
        p("Fantrax > Players > Goalies > Export CSV", style="color:#484f58;font-size:.8em;")
      )),
      column(4, div(class="upload-section",
        h5("\U0001F4CA Data Status"),
        uiOutput("data_status")
      ))
    ),
    fluidRow(
      column(12,
        h4("App Guide", style="color:#f0883e;font-weight:700;margin-top:10px;margin-bottom:14px;"),
        div(class="tab-overview-card",
          h5("\U0001F4CB 2026 Free Agents"),
          p("Browse all BID players whose contracts expire after Season 1. Filter by FA type, position, owner, and value rating.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4B0 Projected Values"),
          p("See what every rostered player should be worth based on score, age, and position. Identify bargains and overpays.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4DC All Contracts"),
          p("Full contract book for all BID players, sorted by tier and value. Click any player for links and projections. Includes Trade Block classification.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F3AF Team Needs & Targets"),
          p("See each team's roster after expirations, identify positional needs, analyze category impact of lost players, and get recommended FA targets to fill gaps.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4CA Trade Analyzer"),
          p("Compare up to 4 players side-by-side with stat comparisons, dynasty outlook, and a verdict on who wins the deal.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4DD Signing Simulator"),
          p("Plan your entire offseason by simulating FA signings and adding ELC/MNR players. Two dropdowns: one for all free agents, one for your team's minor leaguers. Set custom salaries ($0 for non-graduated MNR, ELC amount for graduated). See before vs after category rankings, roster composition, and cap impact.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4B5 Budget Planner"),
          p("See every team's locked salary, available cap space, roster spots to fill, and budget tier for the FA auction.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F6A9 Trade Block"),
          p("Identify sell-high, buy-low, dead weight, and untouchable players across the league based on value, age, and contract length.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4CA Category Analysis"),
          p("Aggregate stats by owner to reveal team strengths and weaknesses across all scoring categories.")
        ),
        div(class="tab-overview-card",
          h5("\U0001F4CA League Overview"),
          p("Power rankings, salary summaries, expiring contract breakdowns, and league-wide contract distribution.")
        )
      )
    )),

    # ═══ FA TAB ═══
    tabPanel("\U0001F4CB 2026 Free Agents",fluidRow(
      column(3,wellPanel(h4("2026 FA Class",style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("<b>Expiring</b> = rostered players whose contracts expire (BID/FA under $2.5M).<br>
          <b>Available FA</b> = unrostered free agents anyone can sign.<br><br>
          Under 27 by June 30 = <span class='badge-rfa'>RFA</span><br>
          27+ = <span class='badge-ufa'>UFA</span><br><br>
          <b>Proj. Salary</b> = estimated market value based on score, age & position.<br>
          <b>Value</b> = actual vs projected (green = bargain, red = overpay)."),style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("fa_source","Pool",c("All","Expiring","Available FA")),
        selectInput("fa_type","FA Type",c("All","RFA","UFA")),
        selectInput("fa_pos","Position",c("All","F","D","G")),
        selectInput("fa_owner","Current Owner",c("All")),selectInput("fa_team","NHL Team",c("All")),
        selectInput("fa_value","Value Rating",c("All","ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE")),
        sliderInput("fa_score","Min Score",0,100,0),
        actionButton("fa_reset","Reset Filters",class="btn-default",width="100%",icon=icon("refresh")))),
      column(9,
        uiOutput("fa_stats"),
        DTOutput("fa_table"),uiOutput("fa_card"),uiOutput("fa_browser")))),

    # ═══ PROJECTED VALUES TAB ═══
    tabPanel("\U0001F4B0 Projected Values", fluidRow(
      column(3, wellPanel(
        h4("Contract Projections", style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Projects what each rostered player <b>should</b> be worth based on:<br><br>
          <b>Score</b> \u2014 fantasy production (primary driver)<br>
          <b>Age</b> \u2014 dynasty premium for youth, decline discount for 30+<br>
          <b>Position</b> \u2014 minor positional adjustment<br><br>
          2026-27 Cap: <b style='color:#f0883e;'>$104M</b><br>
          Cap per team: <b>$7.43M avg</b><br><br>
          <span class='val-elite'>ELITE VALUE</span> = paying &le;50% of worth<br>
          <span class='val-great'>Great Value</span> = 50-70%<br>
          <span class='val-good'>Good Value</span> = 70-90%<br>
          <span class='val-fair'>Fair</span> = 90-110%<br>
          <span class='val-over'>Overpaid</span> = 110-130%<br>
          <span class='val-bad'>Bad Value</span> = 130-160%<br>
          <span class='val-terrible'>TERRIBLE</span> = 160%+"),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("pv_owner","Owner",c("All")),
        selectInput("pv_pos","Position",c("All","F","D","G")),
        selectInput("pv_value","Value Rating",c("All","ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE")),
        selectInput("pv_tier","Contract Tier",c("All","$1M-$2.49M (1 yr / Expiring)","$2.5M-$3.99M (2 yr)","$4M-$6.49M (3 yr)","$6.5M-$8.99M (4 yr)","$9M-$12.5M (5 yr)","$12.5M+ (6 yr)")),
        actionButton("pv_reset","Reset Filters",class="btn-default",width="100%",icon=icon("refresh"))
      )),
      column(9,
        uiOutput("pv_cap_meter"),
        DTOutput("pv_table"),
        uiOutput("pv_owner_summary")
      )
    )),

    # ═══ CONTRACTS TAB ═══
    tabPanel("\U0001F4DC All Contracts",fluidRow(
      column(3,wellPanel(h4("Contract Book",style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("All BID contracts sorted by value.<br><br>
          $1M\u2013$2.49M = 1 yr (Expiring)<br>
          $2.5M\u2013$3.99M = 2 yr<br>
          $4M\u2013$6.49M = 3 yr<br>
          $6.5M\u2013$8.99M = 4 yr<br>
          $9M\u2013$12.5M = 5 yr<br>
          $12.5M+ = 6 yr<br><br>
          <b>Trade Block</b> tags identify:<br>
          <span class='tb-untouchable'>Untouchable</span> = elite value + young + long deal<br>
          <span class='tb-sell-high'>Sell High</span> = great value but aging, sell now<br>
          <span class='tb-buy-low'>Buy Low</span> = underperforming youth<br>
          <span class='tb-dead-weight'>Dead Weight</span> = bad contract, old player"),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("ac_tier","Contract Tier",c("All","$1M-$2.49M (1 yr / Expiring)","$2.5M-$3.99M (2 yr)","$4M-$6.49M (3 yr)","$6.5M-$8.99M (4 yr)","$9M-$12.5M (5 yr)","$12.5M+ (6 yr)")),
        selectInput("ac_pos","Position",c("All","F","D","G")),selectInput("ac_owner","Owner",c("All")),selectInput("ac_team","Team",c("All")),
        selectInput("ac_tradeblock","Trade Block",c("All","Untouchable","Sell High","Buy Low","Dead Weight")),
        actionButton("ac_reset","Reset Filters",class="btn-default",width="100%",icon=icon("refresh")))),
      column(9,DTOutput("ac_table"),uiOutput("ac_card"),uiOutput("ac_browser")))),

    # ═══ TEAM NEEDS TAB ═══
    tabPanel("\U0001F3AF Team Needs & Targets",fluidRow(
      column(3,wellPanel(h4("Roster Analysis",style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Shows each team's roster <b>after</b> expiring contracts walk.<br><br>
          Active roster: <b>12F / 6D / 2G / 3 bench = 23</b><br><br>
          Select an owner to see their expiring players and recommended FA targets."),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("tn_owner","Select Owner",c("(Select)")),
        hr(style="border-color:#21262d;"),
        p("The table ranks all 14 teams by urgency. Click a row or use the dropdown.",style="color:#8b949e;font-size:.8em;"))),
      column(9,DTOutput("tn_table"),uiOutput("tn_detail")))),

    # ═══ TRADE ANALYZER TAB ═══
    tabPanel("\U0001F4CA Trade Analyzer", fluidRow(
      column(3, wellPanel(
        h4("Trade Analyzer", style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Compare up to 4 rostered BID players side-by-side.<br><br>
          Stats are color-coded: <span style='color:#3fb950;font-weight:700;'>green = winner</span>,
          <span style='color:#f85149;font-weight:700;'>red = loser</span>.<br><br>
          Dynasty Outlook shows prime years remaining, contract length, and projected value trend."),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("ta_player_a", "Player A", choices=c("(Select)")),
        selectInput("ta_player_b", "Player B", choices=c("(Select)")),
        selectInput("ta_player_c", "Player C (optional)", choices=c("(None)")),
        selectInput("ta_player_d", "Player D (optional)", choices=c("(None)"))
      )),
      column(9,
        uiOutput("ta_comparison")
      )
    )),

    # ═══ SIGNING SIMULATOR TAB ═══
    tabPanel("\U0001F4DD Signing Simulator", fluidRow(
      column(3, wellPanel(
        h4("Signing Simulator", style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Plan your offseason by simulating FA signings.<br><br>
          1. Select your team<br>
          2. Pick available FAs or add your ELC/MNR players<br>
          3. Set your bid salary<br>
          4. See before vs after impact<br><br>
          <b>Free Agents</b> = unrostered FAs and other teams' expiring contracts.<br>
          <b>ELC / Minor League</b> = your team's MNR players. Graduated prospects (82 career GP skaters / 41 GP goalies) must sign an ELC. Non-graduated MNR players can be rostered at $0."),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("sim_owner", "Select Your Team", c("(Select)")),
        uiOutput("sim_cap_info"),
        hr(style="border-color:#21262d;"),
        actionButton("sim_fetch_career_gp", "Fetch Career GP from Hockey Reference", class="btn-default", width="100%", icon=icon("download"), style="margin-bottom:6px;font-size:.82em;"),
        uiOutput("sim_career_gp_status"),
        hr(style="border-color:#21262d;"),
        h5("Free Agents", style="color:#f0883e;margin:0 0 6px;font-weight:600;font-size:.85em;"),
        selectInput("sim_fa_select", "Available Free Agents", choices=c("(Select a team first)"), multiple=FALSE),
        numericInput("sim_bid_salary", "Bid Salary ($)", value=1000000, min=0, max=17500000, step=100000),
        actionButton("sim_add", "Add FA Signing", class="btn-default", width="100%", icon=icon("plus"), style="margin-bottom:12px;"),
        hr(style="border-color:#21262d;"),
        h5("ELC / Minor League", style="color:#3fb950;margin:0 0 6px;font-weight:600;font-size:.85em;"),
        p("Add your team's MNR prospects to next season's roster.", style="color:#484f58;font-size:.78em;margin-bottom:8px;"),
        selectInput("sim_mnr_select", "Your ELC / MNR Players", choices=c("(Select a team first)"), multiple=FALSE),
        numericInput("sim_mnr_salary", "ELC / MNR Salary ($)", value=0, min=0, max=17500000, step=100000),
        actionButton("sim_add_mnr", "Add ELC / MNR Player", class="btn-default", width="100%", icon=icon("plus"), style="margin-bottom:12px;background:#0a3d1a;border-color:#238636;"),
        uiOutput("sim_signings_list")
      )),
      column(9,
        uiOutput("sim_results")
      )
    )),

    # ═══ BUDGET PLANNER TAB ═══
    tabPanel("\U0001F4B5 Budget Planner", fluidRow(
      column(12,
        h4("Auction Budget Planner", style="color:#f0883e;font-weight:700;margin-bottom:4px;"),
        p("Cap space, roster spots, and spending power for all 14 teams heading into the FA auction.", style="color:#8b949e;font-size:.82em;margin-bottom:16px;"),
        DTOutput("bp_table"),
        uiOutput("bp_detail")
      )
    )),

    # ═══ TRADE BLOCK TAB ═══
    tabPanel("\U0001F6A9 Trade Block", fluidRow(
      column(3, wellPanel(
        h4("Trade Block Identifier", style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Classifies players into trade categories based on value rating, age, and contract length.<br><br>
          <span class='tb-untouchable'>Untouchable</span> \u2014 Elite/Great value, age 25 or under, 3+ yr deal. Core pieces.<br><br>
          <span class='tb-sell-high'>Sell High</span> \u2014 Elite/Great value, age 29+, 3+ yr deal. Producing now but will decline.<br><br>
          <span class='tb-buy-low'>Buy Low</span> \u2014 Overpaid/Bad/Terrible, age 25 or under. Upside play.<br><br>
          <span class='tb-dead-weight'>Dead Weight</span> \u2014 Bad/Terrible value, age 30+, 3+ yr deal. Bad contracts."),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("tb_owner", "Filter by Owner", c("All")),
        selectInput("tb_category", "Trade Block Category", c("All","Untouchable","Sell High","Buy Low","Dead Weight"))
      )),
      column(9,
        uiOutput("tb_summary_stats"),
        uiOutput("tb_cards")
      )
    )),

    # ═══ STAT CATEGORY ANALYSIS TAB ═══
    tabPanel("\U0001F4CA Category Analysis", fluidRow(
      column(3, wellPanel(
        h4("Stat Categories", style="color:#f0883e;margin-top:0;font-weight:700;"),
        p(HTML("Aggregates rostered player stats by owner to reveal team <b>strengths</b> and <b>weaknesses</b>.<br><br>
          Skater: G, A, 2G+A, PIM, SOG, STP, Hit, Blk<br>
          Goalie: W, GAA, SV%, SHO<br><br>
          <span style='color:#ffd700'>Gold</span> = 1st &nbsp;
          <span style='color:#c0c0c0'>Silver</span> = 2nd &nbsp;
          <span style='color:#cd7f32'>Bronze</span> = 3rd<br>
          <span style='color:#3fb950'>Green</span> = Top 5 &nbsp;
          <span style='color:#f85149'>Red</span> = Bottom 5"),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("ca_owner","View Owner Detail",c("(All Teams)")),
        hr(style="border-color:#21262d;"),
        p("The heatmap shows all 14 teams ranked across every category.", style="color:#8b949e;font-size:.8em;")
      )),
      column(9,
        uiOutput("ca_summary_stats"),
        h4("League Category Standings", style="color:#f0883e;font-weight:700;margin-bottom:4px;"),
        p("Rank by category across all 14 teams (rostered players only)", style="color:#8b949e;font-size:.82em;margin-bottom:12px;"),
        DTOutput("ca_heatmap"),
        uiOutput("ca_owner_detail")
      )
    )),

    # ═══ LEAGUE OVERVIEW TAB ═══
    tabPanel("\U0001F4CA League Overview",fluidRow(
      column(12,
        uiOutput("lo_power_rankings"),
        uiOutput("lo_stats"),
        h4("Salary & Roster Summary by Owner",style="color:#f0883e;font-weight:700;"),
        DTOutput("lo_salary_table"),
        hr(style="border-color:#21262d;"),
        h4("Expiring Contract Breakdown",style="color:#f0883e;font-weight:700;"),
        DTOutput("lo_expiring_table"),
        hr(style="border-color:#21262d;"),
        h4("League-Wide Contract Distribution",style="color:#f0883e;font-weight:700;"),
        DTOutput("lo_tier_table")
      )
    ))
  ),

  # ═══ FOOTER ═══
  div(class="app-footer",
    "Dynasty Puck v3.2 \u2022 Offseason Planning \u2022 14-team dynasty league \u2022 ELC/MNR support"
  )
)

server <- function(input, output, session) {
  browser_url <- reactiveValues(fa=NULL, ac=NULL)

  # Career GP cache for MNR graduation (fetched from Hockey Reference)
  mnr_career_gp_cache <- reactiveValues(data=NULL, status="not_fetched")

  # Safe sum over list: sapply on empty list returns list(), not numeric
  safe_sum_list <- function(lst, fn) {
    if(length(lst) == 0) return(0)
    sum(vapply(lst, fn, numeric(1)), na.rm=TRUE)
  }
  safe_count_list <- function(lst, fn) {
    if(length(lst) == 0) return(0L)
    sum(vapply(lst, fn, logical(1)), na.rm=TRUE)
  }

  # Reactive store for simulated signings
  sim_signings <- reactiveVal(list())

  safe_salary <- function(x) {
    if (is.numeric(x)) return(x)
    as.numeric(gsub("[^0-9.]", "", as.character(x)))
  }

  # ═══ DATA LOADING WITH UPLOAD SUPPORT ═══
  skaters_raw <- reactive({
    uploaded <- input$upload_skaters
    path <- if(!is.null(uploaded)) uploaded$datapath else "Fantrax-Players-Dynasty_Puck__74_.csv"
    tryCatch(read_csv(path, show_col_types=FALSE), error=function(e) data.frame())
  })

  goalies_raw <- reactive({
    uploaded <- input$upload_goalies
    path <- if(!is.null(uploaded)) uploaded$datapath else "Fantrax-Players-Dynasty_Puck__75_.csv"
    tryCatch(read_csv(path, show_col_types=FALSE), error=function(e) data.frame())
  })

  output$data_status <- renderUI({
    sk <- skaters_raw(); gl <- goalies_raw()
    sk_n <- nrow(sk); gl_n <- nrow(gl)
    sk_src <- if(!is.null(input$upload_skaters)) "Uploaded" else "Disk"
    gl_src <- if(!is.null(input$upload_goalies)) "Uploaded" else "Disk"
    sk_color <- if(sk_n>0) "#3fb950" else "#f85149"
    gl_color <- if(gl_n>0) "#3fb950" else "#f85149"
    HTML(paste0(
      '<div style="font-size:.9em;">',
      '<div style="margin-bottom:8px;"><span style="color:',sk_color,';font-weight:700;">',sk_n,'</span> skaters <span style="color:#484f58;">(',sk_src,')</span></div>',
      '<div style="margin-bottom:8px;"><span style="color:',gl_color,';font-weight:700;">',gl_n,'</span> goalies <span style="color:#484f58;">(',gl_src,')</span></div>',
      '<div style="margin-top:12px;padding:10px;background:#0d1117;border:1px solid #21262d;border-radius:8px;">',
      '<div style="color:#8b949e;font-size:.82em;">2026-27 Salary Cap</div>',
      '<div style="color:#f0883e;font-size:1.4em;font-weight:700;">$',format(SALARY_CAP,big.mark=","),'</div>',
      '<div style="color:#484f58;font-size:.78em;">$',format(round(SALARY_CAP/N_TEAMS),big.mark=","),' per team avg</div>',
      '</div></div>'
    ))
  })

  load_all <- reactive({
    tryCatch({
      sk <- skaters_raw(); gl <- goalies_raw()
      if(nrow(sk)==0 && nrow(gl)==0) return(data.frame())
      if(nrow(sk)>0) sk <- sk %>%
        mutate(Salary_Num = safe_salary(Salary),
               across(any_of(c("Score","GP","Age","G","A","2G+A","PIM","SOG","STP","Hit","Blk","TK/GV","Cor")), ~suppressWarnings(as.numeric(.))),
               PT="Skater")
      if(nrow(gl)>0) gl <- gl %>%
        mutate(Salary_Num = safe_salary(Salary),
               across(any_of(c("Score","GP","Age","W","GAA","SV%","SHO")), ~suppressWarnings(as.numeric(.))),
               PT="Goalie",
               G=NA_real_,A=NA_real_,`2G+A`=NA_real_,PIM=NA_real_,SOG=NA_real_,STP=NA_real_,Hit=NA_real_,Blk=NA_real_,`TK/GV`=NA_real_,Cor=NA_real_)
      sk_cols <- c("Player","Team","Position","Prim Pos","Status","Age","Salary","Salary_Num","Contract","Score","GP",
                    "G","A","2G+A","PIM","SOG","STP","Hit","Blk","TK/GV","Cor","PT")
      gl_cols <- c("Player","Team","Position","Prim Pos","Status","Age","Salary","Salary_Num","Contract","Score","GP",
                    "G","A","2G+A","PIM","SOG","STP","Hit","Blk","TK/GV","Cor","PT","W","GAA","SV%","SHO")
      sk_out <- if(nrow(sk)>0) sk %>% select(any_of(sk_cols)) else data.frame()
      gl_out <- if(nrow(gl)>0) gl %>% select(any_of(gl_cols)) else data.frame()
      bind_rows(sk_out, gl_out)
    }, error=function(e){ showNotification(paste("Error:", e$message), type="error"); data.frame() })
  })

  fa_2026 <- reactive({
    df <- load_all()
    if(nrow(df)==0) return(df)
    # Expiring contracts: rostered players with BID or FA contract, salary < $2.5M
    expiring <- df %>%
      filter(Status != "FA", Contract %in% c("BID", "FA"), !is.na(Salary_Num),
             Salary_Num >= 1000000, Salary_Num < 2500000) %>%
      mutate(FA_Source = "Expiring")
    # Available free agents (unrostered, Score >= 20 to keep it relevant)
    available <- df %>%
      filter(Status=="FA", !is.na(Score), Score >= 20) %>%
      mutate(FA_Source = "Available FA")
    bind_rows(expiring, available) %>%
      mutate(FA_Type = ifelse(!is.na(Age) & Age < 27, "RFA", "UFA"),
             Proj_Salary = project_salary(Score, Age, `Prim Pos`),
             Value = value_rating(Salary_Num, Proj_Salary),
             Proj_Tier = project_contract_tier(Proj_Salary))
  })

  # MNR players for ELC / minor league additions in the simulator
  mnr_players <- reactive({
    df <- load_all()
    if(nrow(df)==0) return(data.frame())
    mnr <- df %>% filter(Contract == "MNR", Status != "FA")
    if(nrow(mnr)==0) return(data.frame())

    # Use fetched career GP from Hockey Reference if available, else fall back to season GP
    cgp <- mnr_career_gp_cache$data
    if(!is.null(cgp) && nrow(cgp) > 0) {
      mnr <- mnr %>% left_join(cgp, by="Player")
    } else {
      mnr$Career_GP <- NA_integer_
    }

    mnr %>% mutate(
      GP_Threshold = ifelse(`Prim Pos` == "G", 41L, 82L),
      Career_GP = ifelse(is.na(Career_GP), ifelse(is.na(GP), 0L, as.integer(GP)), Career_GP),
      MNR_Status = case_when(
        Career_GP >= GP_Threshold ~ "GRADUATED",
        Career_GP >= GP_Threshold * 0.75 ~ "WATCH",
        Career_GP > 0 ~ "DEVELOPING",
        TRUE ~ "SAFE"
      )
    )
  })

  all_contracts <- reactive({
    df <- load_all()
    if(nrow(df)==0) return(df)
    df %>% filter(Status != "FA", Contract %in% c("BID", "FA"), !is.na(Salary_Num)) %>%
      mutate(
        Contract_Yrs = case_when(
          Salary_Num < 2500000  ~ 1L, Salary_Num < 4000000  ~ 2L, Salary_Num < 6500000  ~ 3L,
          Salary_Num < 9000000  ~ 4L, Salary_Num <= 12500000 ~ 5L, TRUE ~ 6L),
        Tier = case_when(
          Contract_Yrs==1 ~ "$1M-$2.49M (1 yr / Expiring)", Contract_Yrs==2 ~ "$2.5M-$3.99M (2 yr)",
          Contract_Yrs==3 ~ "$4M-$6.49M (3 yr)", Contract_Yrs==4 ~ "$6.5M-$8.99M (4 yr)",
          Contract_Yrs==5 ~ "$9M-$12.5M (5 yr)", TRUE ~ "$12.5M+ (6 yr)"),
        Contract_Status = ifelse(Contract_Yrs==1, "EXPIRING", "UNDER CONTRACT"),
        Salary_Display = paste0("$", format(Salary_Num, big.mark=",", scientific=FALSE)),
        Proj_Salary = project_salary(Score, Age, `Prim Pos`),
        Value = value_rating(Salary_Num, Proj_Salary),
        Proj_Tier = project_contract_tier(Proj_Salary),
        Surplus = Proj_Salary - Salary_Num,
        Trade_Block = classify_trade_block(Value, Age, Contract_Yrs))
  })

  observe({
    df <- load_all() %>% filter(Status != "FA", Contract %in% c("BID", "FA"))
    if(nrow(df)==0) return()
    owners <- sort(unique(df$Status)); teams <- sort(unique(df$Team[df$Team!="(N/A)"]))
    for(id in c("fa_owner","ac_owner","pv_owner")) updateSelectInput(session,id,choices=c("All",owners))
    for(id in c("fa_team","ac_team")) updateSelectInput(session,id,choices=c("All",teams))
    updateSelectInput(session,"tn_owner",choices=c("(Select)",owners))
    updateSelectInput(session,"ca_owner",choices=c("(All Teams)",owners))

    # Trade analyzer player choices
    player_choices <- sort(unique(df$Player))
    updateSelectInput(session, "ta_player_a", choices=c("(Select)", player_choices))
    updateSelectInput(session, "ta_player_b", choices=c("(Select)", player_choices))
    updateSelectInput(session, "ta_player_c", choices=c("(None)", player_choices))
    updateSelectInput(session, "ta_player_d", choices=c("(None)", player_choices))

    # Signing simulator owner choices
    updateSelectInput(session, "sim_owner", choices=c("(Select)", owners))

    # Budget planner & trade block owner choices
    updateSelectInput(session, "tb_owner", choices=c("All", owners))
  })

  make_btn <- function(lbl,url,tp) sprintf('<span class="link-btn" onclick="Shiny.setInputValue(\'%s_open_url\',\'%s\',{priority:\'event\'})">%s</span>',tp,gsub("'","%27",url),lbl)

  # ── Contract Value Over Time HTML generator ──
  build_cvt_html <- function(row) {
    if(is.null(row$Contract_Yrs) || is.na(row$Contract_Yrs) || row$Contract_Yrs <= 1) return("")
    if(is.na(row$Score) || is.na(row$Age)) return("")
    yrs <- row$Contract_Yrs
    actual_sal <- row$Salary_Num
    pos <- row$`Prim Pos`
    current_score <- row$Score
    current_age <- row$Age

    rows_html <- ""
    total_surplus <- 0
    running_score <- current_score

    for(yr in 1:yrs) {
      yr_age <- current_age + (yr - 1)
      if(yr == 1) {
        yr_score <- current_score
      } else {
        decay <- age_decay_factor(yr_age)
        running_score <- running_score * decay
        yr_score <- round(running_score, 1)
      }
      yr_proj_sal <- project_salary(yr_score, yr_age, pos)
      yr_surplus <- yr_proj_sal - actual_sal
      total_surplus <- total_surplus + yr_surplus

      surplus_class <- if(yr_surplus >= 0) "cvt-surplus" else "cvt-deficit"
      surplus_fmt <- paste0(ifelse(yr_surplus >= 0, "+", ""), "$", format(yr_surplus, big.mark=",", scientific=FALSE))
      proj_fmt <- paste0("$", format(yr_proj_sal, big.mark=",", scientific=FALSE))
      sal_fmt <- paste0("$", format(actual_sal, big.mark=",", scientific=FALSE))

      row_bg <- if(yr_surplus >= 0) "background:rgba(63,185,80,.06);" else "background:rgba(248,81,73,.06);"

      rows_html <- paste0(rows_html,
        '<tr style="', row_bg, '">',
        '<td style="color:#c9d1d9;font-weight:600;">Year ', yr, '</td>',
        '<td>', yr_age, '</td>',
        '<td style="color:#f0883e;">', round(yr_score, 1), '</td>',
        '<td>', proj_fmt, '</td>',
        '<td>', sal_fmt, '</td>',
        '<td class="', surplus_class, '">', surplus_fmt, '</td>',
        '</tr>')
    }

    total_color <- if(total_surplus >= 0) "#3fb950" else "#f85149"
    total_bg <- if(total_surplus >= 0) "background:#0a3d1a;border:1px solid #238636;" else "background:#3d1418;border:1px solid #f85149;"
    total_fmt <- paste0(ifelse(total_surplus >= 0, "+", ""), "$", format(total_surplus, big.mark=",", scientific=FALSE))

    paste0(
      '<div style="margin-top:14px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:10px;">',
      '<h5 style="color:#58a6ff;margin:0 0 10px;font-size:.88em;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">Contract Value Over Time</h5>',
      '<div style="color:#8b949e;font-size:.78em;margin-bottom:8px;">Projected performance decline applied per year: 27 or under=+2%, 28-29=-2%, 30-31=-6%, 32-33=-12%, 34+=-20%</div>',
      '<table class="cvt-table"><thead><tr>',
      '<th style="text-align:left;">Year</th><th>Age</th><th>Proj Score</th><th>Proj Salary</th><th>Actual Salary</th><th>Surplus</th>',
      '</tr></thead><tbody>', rows_html, '</tbody></table>',
      '<div class="cvt-total" style="', total_bg, 'text-align:center;color:', total_color, ';">',
      'Total Contract Value: ', total_fmt, ' over ', yrs, ' years</div></div>')
  }

  card_html <- function(row, tp){
    enc <- URLencode(row$Player,reserved=TRUE)
    nq <- URLencode(paste(row$Player,"hockey news"),reserved=TRUE)
    fq <- URLencode(paste(row$Player,"fantasy hockey"),reserved=TRUE)
    xq <- URLencode(paste(row$Player,"hockey"),reserved=TRUE)
    badge <- ""
    if(!is.null(row$FA_Type)) badge <- sprintf(' <span class="%s">%s</span>',ifelse(row$FA_Type=="RFA","badge-rfa","badge-ufa"),row$FA_Type)
    else if(!is.null(row$Contract_Status) && row$Contract_Status=="UNDER CONTRACT") badge <- ' <span class="badge-locked">LOCKED</span>'
    else if(!is.null(row$Contract_Status) && row$Contract_Status=="EXPIRING") badge <- ' <span class="badge-ufa">EXPIRING</span>'
    sal_display <- ifelse(!is.na(row$Salary_Num), paste0("$",format(row$Salary_Num,big.mark=",",scientific=FALSE)), "N/A")
    yrs_info <- ""
    if(!is.null(row$Contract_Yrs)) yrs_info <- paste0(" \u2022 ",row$Contract_Yrs,"-yr deal")

    # Projected value info
    proj_html <- ""
    if(!is.null(row$Proj_Salary) && !is.na(row$Proj_Salary)){
      proj_fmt <- paste0("$",format(row$Proj_Salary,big.mark=",",scientific=FALSE))
      val_class <- case_when(
        row$Value=="ELITE VALUE" ~ "val-elite", row$Value=="Great Value" ~ "val-great",
        row$Value=="Good Value" ~ "val-good", row$Value=="Fair" ~ "val-fair",
        row$Value=="Overpaid" ~ "val-over", row$Value=="Bad Value" ~ "val-bad", TRUE ~ "val-terrible")
      proj_html <- paste0(
        '<div style="margin:10px 0;padding:12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;">',
        '<div style="display:flex;justify-content:space-between;align-items:center;">',
        '<div><span style="color:#8b949e;font-size:.82em;">Projected Market Value</span><br><span style="color:#f0883e;font-size:1.3em;font-weight:700;">',proj_fmt,'</span></div>',
        '<div style="text-align:right;"><span style="color:#8b949e;font-size:.82em;">Value Rating</span><br><span class="',val_class,'" style="font-size:1.1em;">',row$Value,'</span></div>',
        '</div>',
        '<div style="margin-top:8px;color:#8b949e;font-size:.8em;">Actual: ',sal_display,' \u2022 Projected tier: ',
        ifelse(!is.null(row$Proj_Tier), row$Proj_Tier, ""), '</div></div>')
    }

    # Trade block badge
    tb_badge_html <- ""
    if(!is.null(row$Trade_Block) && !is.na(row$Trade_Block)) {
      tb_cls <- switch(row$Trade_Block,
        "Untouchable" = "tb-badge-untouchable",
        "Sell High" = "tb-badge-sell",
        "Buy Low" = "tb-badge-buy",
        "Dead Weight" = "tb-badge-dead",
        "")
      tb_badge_html <- paste0(' <span class="tb-badge ', tb_cls, '">', row$Trade_Block, '</span>')
    }

    # Contract Value Over Time (Feature 4)
    cvt_html <- build_cvt_html(row)

    paste0('<div class="player-card"><h3>',htmltools::htmlEscape(row$Player),badge,tb_badge_html,'</h3>',
      '<div class="meta">',row$`Prim Pos`,' \u2022 ',row$Team,' \u2022 Age: ',row$Age,' \u2022 ',row$Status,' \u2022 ',sal_display,yrs_info,' \u2022 Score: <b style="color:#f0883e">',ifelse(!is.na(row$Score),row$Score,"N/A"),'</b></div>',
      proj_html, cvt_html,
      '<div class="link-section"><h4>\U0001F4F0 News & Analysis</h4>',
        make_btn("\U0001F4F0 Google News",paste0("https://news.google.com/search?q=",nq),tp),
        make_btn("\u26BD Fantasy",paste0("https://www.google.com/search?q=",fq),tp),
        make_btn("\U0001F504 Trade Rumors",paste0("https://www.google.com/search?q=",URLencode(paste(row$Player,"NHL trade rumors"),reserved=TRUE)),tp),'</div>',
      '<div class="link-section"><h4>\U0001F50D Profiles & Stats</h4>',
        make_btn("Elite Prospects",paste0("https://www.eliteprospects.com/search/player?q=",enc),tp),
        make_btn("NHL.com",paste0("https://www.nhl.com/search?q=",enc),tp),
        make_btn("Hockey Ref",paste0("https://www.hockey-reference.com/search/search.fcgi?search=",enc),tp),
        make_btn("CapFriendly",paste0("https://www.capfriendly.com/search?s=",enc),tp),'</div>',
      '<div class="link-section"><h4>\U0001F4AC Social & Video</h4>',
        make_btn("X/Twitter",paste0("https://x.com/search?q=",xq,"&f=live"),tp),
        make_btn("Reddit",paste0("https://www.reddit.com/search/?q=",nq,"&sort=new"),tp),
        make_btn("YouTube",paste0("https://www.youtube.com/results?search_query=",nq),tp),'</div></div>')
  }

  render_browser <- function(url){
    if(is.null(url)) return(div(class="browser-placeholder",div(class="icon","\U0001F310"),p("Click a link above to preview it here")))
    tagList(div(class="browser-bar",div(class="dots",tags$span(class="dot dot-r"),tags$span(class="dot dot-y"),tags$span(class="dot dot-g")),div(class="url-display",url),tags$a("Open \u2197",href=url,target="_blank",style="color:#58a6ff;font-size:.85em;text-decoration:none;font-weight:600;")),tags$iframe(src=url,class="browser-frame",frameborder="0",sandbox="allow-same-origin allow-scripts allow-popups allow-forms"))
  }

  # ═══ FA STATS BAR ═══
  output$fa_stats <- renderUI({
    fa <- fa_f()
    if(nrow(fa)==0) return(div(class="stat-bar",div(class="stat-box",div(class="num","0"),div(class="lbl","Free Agents"))))
    n_exp <- sum(fa$FA_Source=="Expiring",na.rm=TRUE)
    n_avail <- sum(fa$FA_Source=="Available FA",na.rm=TRUE)
    n_rfa <- sum(fa$FA_Type=="RFA",na.rm=TRUE)
    n_ufa <- sum(fa$FA_Type=="UFA",na.rm=TRUE)
    avg_score <- round(mean(fa$Score,na.rm=TRUE),1)
    avg_proj <- paste0("$",format(round(mean(fa$Proj_Salary,na.rm=TRUE)/1e6,1),nsmall=1),"M")
    div(class="stat-bar",
      div(class="stat-box",div(class="num",nrow(fa)),div(class="lbl","Total")),
      div(class="stat-box",div(class="num",style="color:#f85149",n_exp),div(class="lbl","Expiring")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_avail),div(class="lbl","Available FA")),
      div(class="stat-box",div(class="num",style="color:#f0883e",n_rfa),div(class="lbl","RFAs")),
      div(class="stat-box",div(class="num",style="color:#f85149",n_ufa),div(class="lbl","UFAs")),
      div(class="stat-box",div(class="num",avg_score),div(class="lbl","Avg Score")),
      div(class="stat-box",div(class="num",style="color:#a371f7",avg_proj),div(class="lbl","Avg Proj Value")))
  })

  # ═══ 2026 FREE AGENTS ═══
  fa_f <- reactive({
    df <- fa_2026()
    if(nrow(df)==0) return(df)
    if(!is.null(input$fa_source) && input$fa_source!="All") df <- df %>% filter(FA_Source==input$fa_source)
    if(input$fa_type!="All") df <- df %>% filter(FA_Type==input$fa_type)
    if(input$fa_pos!="All") df <- df %>% filter(`Prim Pos`==input$fa_pos)
    if(input$fa_owner!="All") df <- df %>% filter(Status==input$fa_owner)
    if(input$fa_team!="All") df <- df %>% filter(Team==input$fa_team)
    if(input$fa_value!="All") df <- df %>% filter(Value==input$fa_value)
    if(!is.null(input$fa_score)) df <- df %>% filter(Score>=input$fa_score)
    df
  })

  output$fa_table <- renderDT({
    df <- fa_f()
    if(nrow(df)==0) return(datatable(data.frame(Message="No free agents match your filters"),rownames=FALSE))
    display <- df %>%
      mutate(Salary_Disp = paste0("$",format(Salary_Num,big.mark=",",scientific=FALSE)),
             Proj_Disp = paste0("$",format(Proj_Salary,big.mark=",",scientific=FALSE)),
             Owner = ifelse(Status=="FA", "\u2014", Status)) %>%
      select(Player,Team,`Prim Pos`,Age,Owner,FA_Source,FA_Type,Salary_Disp,Proj_Disp,Value,Proj_Tier,Score,GP) %>%
      arrange(desc(Score))
    datatable(display, selection="single",rownames=FALSE,
      colnames=c("Player","Team","Pos","Age","Owner","Pool","FA","Salary","Proj Value","Value","Proj Tier","Score","GP"),
      options=list(pageLength=25,scrollX=TRUE,dom='lftipr',order=list(list(11,'desc')),
        language=list(search="Search players:"))) %>%
      formatStyle('FA_Source',
        backgroundColor=styleEqual(c("Expiring","Available FA"),c("#3d1418","#0a3d1a")),
        color=styleEqual(c("Expiring","Available FA"),c("#f85149","#3fb950")),fontWeight='bold') %>%
      formatStyle('FA_Type',backgroundColor=styleEqual(c("RFA","UFA"),c("#3d2a0a","#3d1418")),color=styleEqual(c("RFA","UFA"),c("#f0883e","#f85149")),fontWeight='bold') %>%
      formatStyle('Value',
        backgroundColor=styleEqual(c("ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE"),
          c("#1a3d0a","#0a3d1a","#1a2d4a","#21262d","#3d2a0a","#3d1418","#3d1418")),
        color=styleEqual(c("ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE"),
          c("#ffd700","#3fb950","#58a6ff","#8b949e","#f0883e","#f85149","#f85149")),fontWeight='bold') %>%
      formatStyle('Score',background=styleColorBar(range(df$Score,na.rm=TRUE),'rgba(240,136,62,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$fa_card <- renderUI({sel<-input$fa_table_rows_selected;if(is.null(sel))return(NULL);r<-(fa_f()%>%arrange(desc(Score)))[sel,];HTML(card_html(r,"fa"))})
  observeEvent(input$fa_open_url,{browser_url$fa<-input$fa_open_url})
  output$fa_browser <- renderUI({render_browser(browser_url$fa)})
  observeEvent(input$fa_reset,{
    for(id in c("fa_source","fa_type","fa_pos","fa_owner","fa_team","fa_value")) updateSelectInput(session,id,selected="All")
    updateSliderInput(session,"fa_score",value=0); browser_url$fa <- NULL
  })

  # ═══ PROJECTED VALUES TAB ═══
  output$pv_cap_meter <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0) return(NULL)
    ow <- input$pv_owner
    if(ow != "All") {
      team_sal <- sum(ac$Salary_Num[ac$Status==ow], na.rm=TRUE)
      team_proj <- sum(ac$Proj_Salary[ac$Status==ow], na.rm=TRUE)
      cap_share <- round(SALARY_CAP / N_TEAMS)
      pct_used <- round(team_sal / cap_share * 100, 1)
      pct_proj <- round(team_proj / cap_share * 100, 1)
      fill_color <- if(pct_used > 100) "background:linear-gradient(90deg,#f85149,#da3633)" else if(pct_used > 85) "background:linear-gradient(90deg,#f0883e,#d97218)" else "background:linear-gradient(90deg,#3fb950,#238636)"
      surplus <- team_proj - team_sal
      surplus_color <- if(surplus > 0) "#3fb950" else "#f85149"
      div(class="cap-meter",
        h5(paste0(ow, " \u2014 Cap Usage")),
        div(style="display:flex;gap:20px;margin-bottom:10px;",
          div(style="flex:1;",
            div(style="color:#8b949e;font-size:.78em;","ACTUAL SPEND"),
            div(style="color:#f0883e;font-size:1.2em;font-weight:700;",paste0("$",format(team_sal,big.mark=",",scientific=FALSE)))),
          div(style="flex:1;",
            div(style="color:#8b949e;font-size:.78em;","PROJECTED VALUE"),
            div(style="color:#a371f7;font-size:1.2em;font-weight:700;",paste0("$",format(team_proj,big.mark=",",scientific=FALSE)))),
          div(style="flex:1;",
            div(style="color:#8b949e;font-size:.78em;","SURPLUS VALUE"),
            div(style=paste0("color:",surplus_color,";font-size:1.2em;font-weight:700;"),paste0(ifelse(surplus>0,"+",""),"$",format(surplus,big.mark=",",scientific=FALSE)))),
          div(style="flex:1;",
            div(style="color:#8b949e;font-size:.78em;","CAP SHARE"),
            div(style="color:#8b949e;font-size:1.2em;font-weight:700;",paste0("$",format(cap_share,big.mark=",",scientific=FALSE))))
        ),
        div(class="cap-track",
          div(class="cap-fill",style=paste0(fill_color,";width:",min(100,pct_used),"%")),
          div(class="cap-label",paste0(pct_used,"% of cap share")))
      )
    } else {
      total_sal <- sum(ac$Salary_Num, na.rm=TRUE)
      total_proj <- sum(ac$Proj_Salary, na.rm=TRUE)
      league_surplus <- total_proj - total_sal
      div(class="stat-bar",
        div(class="stat-box",div(class="num",paste0("$",format(round(total_sal/1e6,1),nsmall=1),"M")),div(class="lbl","League Salary")),
        div(class="stat-box",div(class="num",style="color:#a371f7",paste0("$",format(round(total_proj/1e6,1),nsmall=1),"M")),div(class="lbl","League Projected")),
        div(class="stat-box",div(class="num",style=paste0("color:",if(league_surplus>0)"#3fb950"else"#f85149"),paste0("$",format(round(league_surplus/1e6,1),nsmall=1),"M")),div(class="lbl","Surplus Value")),
        div(class="stat-box",div(class="num",paste0("$",format(round(SALARY_CAP/1e6,1),nsmall=1),"M")),div(class="lbl","2026-27 Cap")))
    }
  })

  output$pv_table <- renderDT({
    ac <- all_contracts()
    if(nrow(ac)==0) return(datatable(data.frame(Message="No data"),rownames=FALSE))
    df <- ac
    if(input$pv_owner!="All") df <- df %>% filter(Status==input$pv_owner)
    if(input$pv_pos!="All") df <- df %>% filter(`Prim Pos`==input$pv_pos)
    if(input$pv_value!="All") df <- df %>% filter(Value==input$pv_value)
    if(input$pv_tier!="All") df <- df %>% filter(Tier==input$pv_tier)

    display <- df %>%
      mutate(Proj_Disp = paste0("$",format(Proj_Salary,big.mark=",",scientific=FALSE)),
             Surplus_Disp = paste0(ifelse(Surplus>0,"+",""),"$",format(Surplus,big.mark=",",scientific=FALSE))) %>%
      select(Player,Team,`Prim Pos`,Age,Status,Salary_Display,Proj_Disp,Surplus_Disp,Value,Contract_Status,Score) %>%
      arrange(desc(Score))

    datatable(display, selection="single",rownames=FALSE,
      colnames=c("Player","Team","Pos","Age","Owner","Actual","Projected","Surplus","Value","Status","Score"),
      options=list(pageLength=25,scrollX=TRUE,dom='lftipr',order=list(list(10,'desc')),
        language=list(search="Search players:"))) %>%
      formatStyle('Value',
        backgroundColor=styleEqual(c("ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE"),
          c("#1a3d0a","#0a3d1a","#1a2d4a","#21262d","#3d2a0a","#3d1418","#3d1418")),
        color=styleEqual(c("ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE"),
          c("#ffd700","#3fb950","#58a6ff","#8b949e","#f0883e","#f85149","#f85149")),fontWeight='bold') %>%
      formatStyle('Contract_Status',
        color=styleEqual(c("EXPIRING","UNDER CONTRACT"),c("#f85149","#3fb950")),fontWeight='bold') %>%
      formatStyle('Score',background=styleColorBar(c(0,100),'rgba(240,136,62,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$pv_owner_summary <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0 || input$pv_owner=="All") return(NULL)
    ow <- input$pv_owner
    team <- ac %>% filter(Status==ow) %>% arrange(desc(Score))
    if(nrow(team)==0) return(NULL)

    best_values <- team %>% filter(Value %in% c("ELITE VALUE","Great Value")) %>% head(5)
    worst_values <- team %>% filter(Value %in% c("Bad Value","TERRIBLE")) %>% head(5)
    biggest_surplus <- team %>% arrange(desc(Surplus)) %>% head(5)

    bv_html <- if(nrow(best_values)>0) paste0(
      '<div class="rec-section"><h5>Best Value Contracts</h5>',
      paste0('<div class="needs-row"><b>',htmltools::htmlEscape(best_values$Player),'</b> \u2014 ',
        best_values$`Prim Pos`,', Age ',best_values$Age,
        ' \u2022 Paying: <span style="color:#3fb950">',best_values$Salary_Display,'</span>',
        ' \u2022 Worth: <span style="color:#a371f7">$',format(best_values$Proj_Salary,big.mark=",",scientific=FALSE),'</span>',
        ' \u2022 <span class="val-elite">',best_values$Value,'</span></div>',collapse=""),'</div>') else ""

    wv_html <- if(nrow(worst_values)>0) paste0(
      '<div class="rec-section" style="margin-top:10px;"><h5 style="color:#f85149;">Worst Value Contracts</h5>',
      paste0('<div class="needs-row"><b>',htmltools::htmlEscape(worst_values$Player),'</b> \u2014 ',
        worst_values$`Prim Pos`,', Age ',worst_values$Age,
        ' \u2022 Paying: <span style="color:#f85149">',worst_values$Salary_Display,'</span>',
        ' \u2022 Worth: <span style="color:#a371f7">$',format(worst_values$Proj_Salary,big.mark=",",scientific=FALSE),'</span>',
        ' \u2022 <span class="val-bad">',worst_values$Value,'</span></div>',collapse=""),'</div>') else ""

    n_good <- sum(team$Value %in% c("ELITE VALUE","Great Value","Good Value"))
    n_bad <- sum(team$Value %in% c("Overpaid","Bad Value","TERRIBLE"))
    total_surplus <- sum(team$Surplus, na.rm=TRUE)
    surplus_color <- if(total_surplus > 0) "#3fb950" else "#f85149"

    HTML(paste0('<div class="cat-card"><h4>',htmltools::htmlEscape(ow),' \u2014 Value Summary</h4>',
      '<div class="meta">',n_good,' good+ value contracts \u2022 ',n_bad,' overpaid contracts \u2022 ',
      'Net surplus: <b style="color:',surplus_color,'">',ifelse(total_surplus>0,"+",""),'$',format(total_surplus,big.mark=",",scientific=FALSE),'</b></div>',
      bv_html, wv_html, '</div>'))
  })

  # ═══ PROJECTED VALUES RESET ═══
  observeEvent(input$pv_reset, {
    updateSelectInput(session, "pv_owner", selected="All")
    updateSelectInput(session, "pv_pos", selected="All")
    updateSelectInput(session, "pv_value", selected="All")
    updateSelectInput(session, "pv_tier", selected="All")
  })

  # ═══ ALL CONTRACTS ═══
  ac_f <- reactive({
    df <- all_contracts()
    if(nrow(df)==0) return(df)
    if(input$ac_tier!="All") df <- df %>% filter(Tier==input$ac_tier)
    if(input$ac_pos!="All") df <- df %>% filter(`Prim Pos`==input$ac_pos)
    if(input$ac_owner!="All") df <- df %>% filter(Status==input$ac_owner)
    if(input$ac_team!="All") df <- df %>% filter(Team==input$ac_team)
    if(!is.null(input$ac_tradeblock) && input$ac_tradeblock!="All") df <- df %>% filter(Trade_Block==input$ac_tradeblock)
    df
  })

  output$ac_table <- renderDT({
    df <- ac_f()
    if(nrow(df)==0) return(datatable(data.frame(Message="No contracts match filters"),rownames=FALSE))
    display <- df %>%
      mutate(Proj_Disp=paste0("$",format(Proj_Salary,big.mark=",",scientific=FALSE)),
             TB=ifelse(is.na(Trade_Block), "-", Trade_Block)) %>%
      select(Player,Team,`Prim Pos`,Age,Status,Contract_Status,Tier,Salary_Display,Proj_Disp,Value,Contract_Yrs,Score,GP,TB) %>%
      arrange(desc(Score))
    datatable(display, selection="single",rownames=FALSE,
      colnames=c("Player","Team","Pos","Age","Owner","Status","Tier","Salary","Proj Value","Value","Yrs","Score","GP","Trade Block"),
      options=list(pageLength=25,scrollX=TRUE,dom='lftipr',order=list(list(11,'desc')),
        language=list(search="Search players:"))) %>%
      formatStyle('Contract_Status',backgroundColor=styleEqual(c("EXPIRING","UNDER CONTRACT"),c("#3d1418","#0a3d1a")),color=styleEqual(c("EXPIRING","UNDER CONTRACT"),c("#f85149","#3fb950")),fontWeight='bold') %>%
      formatStyle('Value',
        color=styleEqual(c("ELITE VALUE","Great Value","Good Value","Fair","Overpaid","Bad Value","TERRIBLE"),
          c("#ffd700","#3fb950","#58a6ff","#8b949e","#f0883e","#f85149","#f85149")),fontWeight='bold') %>%
      formatStyle('Score',background=styleColorBar(range(df$Score,na.rm=TRUE),'rgba(240,136,62,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('TB',
        color=styleEqual(c("Untouchable","Sell High","Buy Low","Dead Weight","-"),
          c("#58a6ff","#ffd700","#3fb950","#f85149","#484f58")),fontWeight='bold')
  })

  output$ac_card <- renderUI({sel<-input$ac_table_rows_selected;if(is.null(sel))return(NULL);r<-(ac_f()%>%arrange(desc(Score)))[sel,];HTML(card_html(r,"ac"))})
  observeEvent(input$ac_open_url,{browser_url$ac<-input$ac_open_url})
  output$ac_browser <- renderUI({render_browser(browser_url$ac)})

  # ═══ ALL CONTRACTS RESET ═══
  observeEvent(input$ac_reset, {
    updateSelectInput(session, "ac_tier", selected="All")
    updateSelectInput(session, "ac_pos", selected="All")
    updateSelectInput(session, "ac_owner", selected="All")
    updateSelectInput(session, "ac_team", selected="All")
    updateSelectInput(session, "ac_tradeblock", selected="All")
  })

  # ═══ TEAM NEEDS & TARGETS ═══
  build_needs <- reactive({
    ac <- all_contracts(); fa <- fa_2026()
    if(nrow(ac)==0) return(data.frame())
    owners <- sort(unique(ac$Status))
    lapply(owners, function(ow){
      roster <- ac %>% filter(Status==ow)
      expiring <- fa %>% filter(Status==ow)
      cur_f <- sum(roster$`Prim Pos`=="F",na.rm=TRUE); cur_d <- sum(roster$`Prim Pos`=="D",na.rm=TRUE); cur_g <- sum(roster$PT=="Goalie",na.rm=TRUE)
      exp_f <- sum(expiring$`Prim Pos`=="F",na.rm=TRUE); exp_d <- sum(expiring$`Prim Pos`=="D",na.rm=TRUE); exp_g <- sum(expiring$PT=="Goalie",na.rm=TRUE)
      rem_f <- cur_f-exp_f; rem_d <- cur_d-exp_d; rem_g <- cur_g-exp_g
      need_f <- max(0,12-rem_f); need_d <- max(0,6-rem_d); need_g <- max(0,2-rem_g)
      total_sal <- sum(roster$Salary_Num,na.rm=TRUE); exp_sal <- sum(expiring$Salary_Num,na.rm=TRUE)
      avg_score <- round(mean(roster$Score,na.rm=TRUE),1)
      urgency <- need_f*2 + need_d*3 + need_g*5
      data.frame(Owner=ow,Cur_F=cur_f,Cur_D=cur_d,Cur_G=cur_g,Total=nrow(roster),
        Expiring=nrow(expiring),Exp_F=exp_f,Exp_D=exp_d,Exp_G=exp_g,
        Rem_F=rem_f,Rem_D=rem_d,Rem_G=rem_g,Need_F=need_f,Need_D=need_d,Need_G=need_g,
        Urgency=urgency,Total_Salary=total_sal,Locked_Salary=total_sal-exp_sal,Cap_Freed=exp_sal,
        Avg_Score=avg_score,Top_Expiring=paste(head(expiring%>%arrange(desc(Score))%>%pull(Player),3),collapse=", "),
        stringsAsFactors=FALSE)
    }) %>% bind_rows() %>% arrange(desc(Urgency))
  })

  output$tn_table <- renderDT({
    needs <- build_needs()
    if(nrow(needs)==0) return(datatable(data.frame(Message="No data"),rownames=FALSE))
    display <- needs %>% select(Owner,Total,Expiring,Rem_F,Rem_D,Rem_G,Need_F,Need_D,Need_G,Urgency,Cap_Freed,Avg_Score)
    datatable(display, rownames=FALSE, selection="single",
      options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(9,'desc'))),
      colnames=c("Owner","Roster","Exp","Rem F","Rem D","Rem G","Need F","Need D","Need G","Urgency","Cap Freed","Avg Score")) %>%
      formatCurrency("Cap_Freed",currency="$",digits=0) %>%
      formatStyle('Urgency',backgroundColor=styleInterval(c(8,15),c("#0d1117","#3d2a0a","#3d1418")),color=styleInterval(c(8,15),c("#3fb950","#f0883e","#f85149")),fontWeight='bold') %>%
      formatStyle('Need_F',color=styleInterval(c(3,5),c("#3fb950","#f0883e","#f85149")),fontWeight='bold') %>%
      formatStyle('Need_D',color=styleInterval(c(2,4),c("#3fb950","#f0883e","#f85149")),fontWeight='bold') %>%
      formatStyle('Need_G',color=styleInterval(c(0,1),c("#3fb950","#f0883e","#f85149")),fontWeight='bold')
  })

  observeEvent(input$tn_table_rows_selected,{
    sel<-input$tn_table_rows_selected;if(!is.null(sel)){needs<-build_needs();if(nrow(needs)>=sel) updateSelectInput(session,"tn_owner",selected=needs$Owner[sel])}
  })

  output$tn_detail <- renderUI({
    ow <- input$tn_owner
    if(is.null(ow)||ow=="(Select)") return(div(class="needs-card",h4("Select an owner to see their free agency outlook"),p("Click a row in the table or use the dropdown.",style="color:#484f58;")))
    fa <- fa_2026(); needs <- build_needs() %>% filter(Owner==ow)
    if(nrow(needs)==0) return(NULL)
    ac <- all_contracts()
    my_expiring <- fa %>% filter(Status==ow) %>% arrange(desc(Score))
    available <- fa %>% filter(Status!=ow) %>% arrange(desc(Score))
    my_roster <- ac %>% filter(Status==ow)

    exp_html <- if(nrow(my_expiring)>0) paste0(
      '<h4 style="color:#f85149;margin-top:14px;font-weight:700;">Expiring Contracts (',nrow(my_expiring),')</h4>',
      paste0('<div class="needs-row"><b>',htmltools::htmlEscape(my_expiring$Player),'</b> \u2014 ',my_expiring$`Prim Pos`,
        ', Age ',my_expiring$Age,', $',format(my_expiring$Salary_Num,big.mark=",",scientific=FALSE),
        ' \u2022 Worth: <span style="color:#a371f7">$',format(my_expiring$Proj_Salary,big.mark=",",scientific=FALSE),'</span>',
        ', Score: <b style="color:#f0883e">',my_expiring$Score,'</b> <span class="',
        ifelse(my_expiring$FA_Type=="RFA","badge-rfa","badge-ufa"),'">',my_expiring$FA_Type,'</span></div>',collapse="")
    ) else '<h4 style="color:#3fb950;margin-top:14px;font-weight:700;">No Expiring Contracts</h4>'

    # ═══ CATEGORY IMPACT ANALYSIS ═══
    cat_impact_html <- ""
    if(nrow(my_expiring)>0 && nrow(my_roster)>0) {
      sk_cats <- c("G","A","2G+A","PIM","SOG","STP","Hit","Blk")
      gl_cats <- c("W","GAA","SV%","SHO")

      exp_skaters <- my_expiring %>% filter(PT=="Skater")
      exp_goalies <- my_expiring %>% filter(PT=="Goalie")
      roster_skaters <- my_roster %>% filter(PT=="Skater")
      roster_goalies <- my_roster %>% filter(PT=="Goalie")

      cat_rows <- ""
      hurt_cats <- c()

      # Skater category losses
      for(cat in sk_cats) {
        if(!cat %in% names(my_roster)) next
        team_total <- sum(roster_skaters[[cat]], na.rm=TRUE)
        lost <- sum(exp_skaters[[cat]], na.rm=TRUE)
        if(team_total == 0) next
        pct_lost <- round(lost / team_total * 100, 1)
        bar_color <- if(pct_lost > 25) "#f85149" else if(pct_lost > 15) "#f0883e" else if(pct_lost >= 10) "#f0883e" else "#3fb950"
        label_color <- if(pct_lost > 25) "color:#f85149;font-weight:700" else if(pct_lost > 15) "color:#f0883e;font-weight:600" else "color:#3fb950"
        if(pct_lost > 20) hurt_cats <- c(hurt_cats, cat)
        cat_rows <- paste0(cat_rows,
          '<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #21262d;font-size:.88em;">',
          '<div style="width:60px;color:#8b949e;font-weight:600;">', cat, '</div>',
          '<div style="width:80px;text-align:right;color:#c9d1d9;">', round(lost,1), '</div>',
          '<div style="width:80px;text-align:right;color:#8b949e;">', round(team_total,1), '</div>',
          '<div style="flex:1;padding:0 12px;"><div style="height:6px;border-radius:3px;background:#21262d;"><div style="height:100%;border-radius:3px;width:', min(pct_lost,100), '%;background:', bar_color, ';"></div></div></div>',
          '<div style="width:60px;text-align:right;', label_color, ';">', pct_lost, '%</div>',
          '</div>')
      }

      # Goalie category losses
      for(cat in gl_cats) {
        if(!cat %in% names(my_roster)) next
        if(cat == "GAA" || cat == "SV%") {
          # For rate stats, show how many goalies are lost
          n_roster_g <- nrow(roster_goalies)
          n_exp_g <- nrow(exp_goalies)
          if(n_roster_g == 0) next
          pct_lost <- round(n_exp_g / n_roster_g * 100, 1)
          team_val <- if(cat=="GAA") round(mean(roster_goalies[[cat]], na.rm=TRUE),2) else round(mean(roster_goalies[[cat]], na.rm=TRUE),3)
          lost_val <- if(n_exp_g > 0) { if(cat=="GAA") round(mean(exp_goalies[[cat]], na.rm=TRUE),2) else round(mean(exp_goalies[[cat]], na.rm=TRUE),3) } else 0
          bar_color <- if(pct_lost > 25) "#f85149" else if(pct_lost > 15) "#f0883e" else "#3fb950"
          label_color <- if(pct_lost > 25) "color:#f85149;font-weight:700" else if(pct_lost > 15) "color:#f0883e;font-weight:600" else "color:#3fb950"
          if(pct_lost > 20) hurt_cats <- c(hurt_cats, cat)
          cat_rows <- paste0(cat_rows,
            '<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #21262d;font-size:.88em;">',
            '<div style="width:60px;color:#8b949e;font-weight:600;">', cat, '</div>',
            '<div style="width:80px;text-align:right;color:#c9d1d9;">', lost_val, '</div>',
            '<div style="width:80px;text-align:right;color:#8b949e;">', team_val, '</div>',
            '<div style="flex:1;padding:0 12px;"><div style="height:6px;border-radius:3px;background:#21262d;"><div style="height:100%;border-radius:3px;width:', min(pct_lost,100), '%;background:', bar_color, ';"></div></div></div>',
            '<div style="width:60px;text-align:right;', label_color, ';">', pct_lost, '% G</div>',
            '</div>')
        } else {
          team_total <- sum(roster_goalies[[cat]], na.rm=TRUE)
          lost <- sum(exp_goalies[[cat]], na.rm=TRUE)
          if(team_total == 0) next
          pct_lost <- round(lost / team_total * 100, 1)
          bar_color <- if(pct_lost > 25) "#f85149" else if(pct_lost > 15) "#f0883e" else "#3fb950"
          label_color <- if(pct_lost > 25) "color:#f85149;font-weight:700" else if(pct_lost > 15) "color:#f0883e;font-weight:600" else "color:#3fb950"
          if(pct_lost > 20) hurt_cats <- c(hurt_cats, cat)
          cat_rows <- paste0(cat_rows,
            '<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #21262d;font-size:.88em;">',
            '<div style="width:60px;color:#8b949e;font-weight:600;">', cat, '</div>',
            '<div style="width:80px;text-align:right;color:#c9d1d9;">', round(lost,1), '</div>',
            '<div style="width:80px;text-align:right;color:#8b949e;">', round(team_total,1), '</div>',
            '<div style="flex:1;padding:0 12px;"><div style="height:6px;border-radius:3px;background:#21262d;"><div style="height:100%;border-radius:3px;width:', min(pct_lost,100), '%;background:', bar_color, ';"></div></div></div>',
            '<div style="width:60px;text-align:right;', label_color, ';">', pct_lost, '%</div>',
            '</div>')
        }
      }

      # Cap space analysis
      team_sal <- sum(my_roster$Salary_Num, na.rm=TRUE)
      exp_sal <- sum(my_expiring$Salary_Num, na.rm=TRUE)
      locked_sal <- team_sal - exp_sal
      cap_share <- round(SALARY_CAP / N_TEAMS)
      cap_space <- cap_share - locked_sal
      avg_per_team <- round(SALARY_CAP / N_TEAMS)
      salary_tier <- if(cap_space > 10000000) "Premium ($9M+) FAs" else if(cap_space > 6000000) "Mid-tier ($4M-$9M) FAs" else if(cap_space > 3000000) "Budget ($2.5M-$4M) FAs" else "Minimum salary FAs only"
      cap_color <- if(cap_space > avg_per_team) "#3fb950" else if(cap_space > avg_per_team * 0.5) "#f0883e" else "#f85149"

      cap_html <- paste0(
        '<div style="margin-top:12px;padding:12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;">',
        '<div style="display:flex;gap:16px;flex-wrap:wrap;">',
        '<div style="flex:1;min-width:120px;text-align:center;"><div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Locked Salary</div><div style="color:#f0883e;font-size:1.1em;font-weight:700;">$', format(locked_sal, big.mark=",", scientific=FALSE), '</div></div>',
        '<div style="flex:1;min-width:120px;text-align:center;"><div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Cap Space</div><div style="color:', cap_color, ';font-size:1.1em;font-weight:700;">$', format(cap_space, big.mark=",", scientific=FALSE), '</div></div>',
        '<div style="flex:1;min-width:120px;text-align:center;"><div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Avg Per Team</div><div style="color:#8b949e;font-size:1.1em;font-weight:700;">$', format(avg_per_team, big.mark=",", scientific=FALSE), '</div></div>',
        '<div style="flex:1;min-width:160px;text-align:center;"><div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Can Target</div><div style="color:#58a6ff;font-size:.95em;font-weight:600;">', salary_tier, '</div></div>',
        '</div></div>')

      # Hurt categories summary
      hurt_summary <- ""
      if(length(hurt_cats) > 0) {
        hurt_summary <- paste0(
          '<div style="margin-top:10px;padding:10px;background:#3d1418;border:1px solid #f85149;border-radius:8px;font-size:.88em;">',
          '<span style="color:#f85149;font-weight:700;">Most affected categories:</span> ',
          '<span style="color:#c9d1d9;">', paste(hurt_cats, collapse=", "), '</span>',
          ' &mdash; losing &gt;20% of production in these areas',
          '</div>')
      }

      cat_impact_html <- paste0(
        '<h4 style="color:#58a6ff;margin-top:18px;font-weight:700;">Category Impact</h4>',
        '<div style="font-size:.82em;color:#8b949e;margin-bottom:8px;">Stats lost from expiring contracts vs team totals</div>',
        '<div style="display:flex;padding:4px 0;font-size:.75em;color:#484f58;text-transform:uppercase;letter-spacing:.04em;">',
        '<div style="width:60px;">Cat</div><div style="width:80px;text-align:right;">Lost</div><div style="width:80px;text-align:right;">Team</div><div style="flex:1;padding:0 12px;">Impact</div><div style="width:60px;text-align:right;">% Lost</div></div>',
        cat_rows, hurt_summary, cap_html)

      # ═══ TARGETED FA RECOMMENDATIONS BASED ON CATEGORY LOSSES ═══
      if(length(hurt_cats) > 0 && nrow(available) > 0) {
        sk_hurt <- intersect(hurt_cats, sk_cats)
        gl_hurt <- intersect(hurt_cats, gl_cats)
        cat_rec_html <- ""

        if(length(sk_hurt) > 0) {
          avail_sk <- available %>% filter(PT=="Skater")
          if(nrow(avail_sk) > 0) {
            avail_sk$cat_fill_score <- 0
            for(wc in sk_hurt) {
              if(wc %in% names(avail_sk)) {
                cv <- avail_sk[[wc]]; cv[is.na(cv)] <- 0
                mx <- max(cv, na.rm=TRUE)
                if(mx > 0) avail_sk$cat_fill_score <- avail_sk$cat_fill_score + (cv / mx * 100)
              }
            }
            top_fills <- avail_sk %>% arrange(desc(cat_fill_score)) %>% head(8)
            if(nrow(top_fills) > 0) {
              fill_details <- sapply(seq_len(nrow(top_fills)), function(i) {
                p <- top_fills[i,]
                cat_vals <- sapply(sk_hurt, function(c) if(c %in% names(p) && !is.na(p[[c]])) paste0(c,":",round(p[[c]],0)) else NULL)
                cat_vals <- Filter(Negate(is.null), cat_vals)
                paste0('<div class="needs-row"><b>', htmltools::htmlEscape(p$Player), '</b> (', p$Team, ') \u2014 ',
                  p$`Prim Pos`, ', Age ', p$Age, ', Score: <b style="color:#f0883e">', p$Score, '</b>',
                  ' \u2022 Fills: <span style="color:#58a6ff">', paste(cat_vals, collapse=", "), '</span>',
                  ' \u2022 Proj: $', format(p$Proj_Salary, big.mark=",", scientific=FALSE),
                  ' <span class="', ifelse(p$FA_Type=="RFA","badge-rfa","badge-ufa"), '">', p$FA_Type, '</span></div>')
              })
              cat_rec_html <- paste0(cat_rec_html,
                '<div class="rec-section" style="margin-top:14px;"><h5 style="color:#58a6ff;">Category-Fill Targets (',
                paste(sk_hurt, collapse=", "), ')</h5>', paste(fill_details, collapse=""), '</div>')
            }
          }
        }
        if(length(gl_hurt) > 0) {
          avail_gl <- available %>% filter(PT=="Goalie")
          if(nrow(avail_gl) > 0) {
            top_gl <- avail_gl %>% arrange(desc(Score)) %>% head(4)
            if(nrow(top_gl) > 0) {
              gl_details <- sapply(seq_len(nrow(top_gl)), function(i) {
                p <- top_gl[i,]
                paste0('<div class="needs-row"><b>', htmltools::htmlEscape(p$Player), '</b> (', p$Team, ') \u2014 Age ', p$Age,
                  ', Score: <b style="color:#f0883e">', p$Score, '</b>',
                  ' \u2022 Proj: $', format(p$Proj_Salary, big.mark=",", scientific=FALSE),
                  ' <span class="', ifelse(p$FA_Type=="RFA","badge-rfa","badge-ufa"), '">', p$FA_Type, '</span></div>')
              })
              cat_rec_html <- paste0(cat_rec_html,
                '<div class="rec-section" style="margin-top:14px;"><h5 style="color:#58a6ff;">Goalie Targets (',
                paste(gl_hurt, collapse=", "), ')</h5>', paste(gl_details, collapse=""), '</div>')
            }
          }
        }
        cat_impact_html <- paste0(cat_impact_html, cat_rec_html)
      }
    }

    # ═══ POSITIONAL NEEDS RECOMMENDATIONS ═══
    rec_html <- ""
    n_f <- needs$Need_F; n_d <- needs$Need_D; n_g <- needs$Need_G
    if(n_f>0){ top_f<-available%>%filter(`Prim Pos`=="F")%>%head(min(n_f+2,10));if(nrow(top_f)>0) rec_html<-paste0(rec_html,'<div class="rec-section"><h5>\U0001F3AF Target Forwards (need ',n_f,')</h5>',paste0('<div class="needs-row">',htmltools::htmlEscape(top_f$Player),' (',top_f$Team,') \u2014 Age ',top_f$Age,', Score: <b style="color:#f0883e">',top_f$Score,'</b> \u2022 Proj: $',format(top_f$Proj_Salary,big.mark=",",scientific=FALSE),' <span class="',ifelse(top_f$FA_Type=="RFA","badge-rfa","badge-ufa"),'">',top_f$FA_Type,'</span></div>',collapse=""),'</div>') }
    if(n_d>0){ top_d<-available%>%filter(`Prim Pos`=="D")%>%head(min(n_d+2,8));if(nrow(top_d)>0) rec_html<-paste0(rec_html,'<div class="rec-section"><h5>\U0001F3AF Target Defensemen (need ',n_d,')</h5>',paste0('<div class="needs-row">',htmltools::htmlEscape(top_d$Player),' (',top_d$Team,') \u2014 Age ',top_d$Age,', Score: <b style="color:#f0883e">',top_d$Score,'</b> \u2022 Proj: $',format(top_d$Proj_Salary,big.mark=",",scientific=FALSE),' <span class="',ifelse(top_d$FA_Type=="RFA","badge-rfa","badge-ufa"),'">',top_d$FA_Type,'</span></div>',collapse=""),'</div>') }
    if(n_g>0){ top_g<-available%>%filter(PT=="Goalie")%>%head(3);if(nrow(top_g)>0) rec_html<-paste0(rec_html,'<div class="rec-section"><h5>\U0001F3AF Target Goalies (need ',n_g,')</h5>',paste0('<div class="needs-row">',htmltools::htmlEscape(top_g$Player),' (',top_g$Team,') \u2014 Age ',top_g$Age,', Score: <b style="color:#f0883e">',top_g$Score,'</b> <span class="',ifelse(top_g$FA_Type=="RFA","badge-rfa","badge-ufa"),'">',top_g$FA_Type,'</span></div>',collapse=""),'</div>') }
    if(n_f==0&&n_d==0&&n_g==0) rec_html<-'<div class="rec-section"><h5 style="color:#3fb950;">\u2705 Roster is full after expirations</h5></div>'

    urgency_class <- if(needs$Urgency>=15)"need-urgent"else if(needs$Urgency>=8)"need-moderate"else"need-ok"
    summary <- paste0('<div class="meta">Roster after expirations: <b>',needs$Rem_F,'F / ',needs$Rem_D,'D / ',needs$Rem_G,'G</b> \u2022 Needs: <span class="',urgency_class,'">',needs$Need_F,'F, ',needs$Need_D,'D, ',needs$Need_G,'G</span> \u2022 Cap freed: <b style="color:#3fb950">$',format(needs$Cap_Freed,big.mark=",",scientific=FALSE),'</b></div>')
    HTML(paste0('<div class="needs-card"><h4>',htmltools::htmlEscape(ow),' \u2014 Free Agency Outlook</h4>',summary,exp_html,cat_impact_html,rec_html,'</div>'))
  })

  # ═══ TRADE ANALYZER ═══
  output$ta_comparison <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0) return(div(class="trade-verdict", h4("Upload data to use the Trade Analyzer")))

    selected_names <- c()
    if(!is.null(input$ta_player_a) && input$ta_player_a != "(Select)") selected_names <- c(selected_names, input$ta_player_a)
    if(!is.null(input$ta_player_b) && input$ta_player_b != "(Select)") selected_names <- c(selected_names, input$ta_player_b)
    if(!is.null(input$ta_player_c) && input$ta_player_c != "(None)") selected_names <- c(selected_names, input$ta_player_c)
    if(!is.null(input$ta_player_d) && input$ta_player_d != "(None)") selected_names <- c(selected_names, input$ta_player_d)

    if(length(selected_names) < 2) return(div(class="trade-verdict", h4("Select at least 2 players to compare"), p("Use the dropdowns on the left to pick players.", style="color:#484f58;")))

    players <- ac %>% filter(Player %in% selected_names)
    if(nrow(players) < 2) return(div(class="trade-verdict", h4("Could not find selected players in contract data")))

    # Ensure unique matches
    player_list <- lapply(selected_names, function(nm) {
      row <- players %>% filter(Player == nm) %>% head(1)
      if(nrow(row) == 0) return(NULL)
      row
    })
    player_list <- Filter(Negate(is.null), player_list)
    if(length(player_list) < 2) return(NULL)

    # Build comparison cards
    skater_stats <- c("G","A","2G+A","PIM","SOG","STP","Hit","Blk")
    goalie_stats <- c("W","GAA","SV%","SHO")
    info_fields <- c("Team","Prim Pos","Age","Status","Salary_Num","Proj_Salary","Value","Surplus","Score","GP")

    cards_html <- ""
    for(i in seq_along(player_list)) {
      p_row <- player_list[[i]]
      sal_fmt <- paste0("$", format(p_row$Salary_Num, big.mark=",", scientific=FALSE))
      proj_fmt <- paste0("$", format(p_row$Proj_Salary, big.mark=",", scientific=FALSE))
      surplus_fmt <- paste0(ifelse(p_row$Surplus > 0, "+", ""), "$", format(p_row$Surplus, big.mark=",", scientific=FALSE))
      surplus_color <- if(p_row$Surplus > 0) "#3fb950" else "#f85149"

      val_class <- case_when(
        p_row$Value=="ELITE VALUE" ~ "val-elite", p_row$Value=="Great Value" ~ "val-great",
        p_row$Value=="Good Value" ~ "val-good", p_row$Value=="Fair" ~ "val-fair",
        p_row$Value=="Overpaid" ~ "val-over", p_row$Value=="Bad Value" ~ "val-bad", TRUE ~ "val-terrible")

      # Dynasty outlook
      age <- p_row$Age
      prime_remaining <- if(!is.na(age)) max(0, 28 - age) else NA
      prime_text <- if(is.na(prime_remaining)) "Unknown" else if(prime_remaining > 4) paste0(prime_remaining, " years (entering prime)") else if(prime_remaining > 0) paste0(prime_remaining, " years") else "Past prime"
      prime_color <- if(is.na(prime_remaining)) "#8b949e" else if(prime_remaining > 4) "#3fb950" else if(prime_remaining > 0) "#f0883e" else "#f85149"

      contract_yrs <- p_row$Contract_Yrs
      contract_text <- paste0(contract_yrs, " year", ifelse(contract_yrs > 1, "s", ""))

      trend <- if(is.na(age)) "Unknown" else if(age <= 23) "Rising" else if(age <= 28) "Stable (Prime)" else if(age <= 31) "Declining" else "Steep Decline"
      trend_color <- if(is.na(age)) "#8b949e" else if(age <= 23) "#3fb950" else if(age <= 28) "#58a6ff" else if(age <= 31) "#f0883e" else "#f85149"

      # Stat rows
      stat_rows <- ""
      stat_rows <- paste0(stat_rows,
        '<div class="trade-stat-row"><span class="stat-label">Team</span><span class="stat-val">', htmltools::htmlEscape(as.character(p_row$Team)), '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Position</span><span class="stat-val">', p_row$`Prim Pos`, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Age</span><span class="stat-val">', p_row$Age, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Owner</span><span class="stat-val">', htmltools::htmlEscape(as.character(p_row$Status)), '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Salary</span><span class="stat-val">', sal_fmt, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Proj Value</span><span class="stat-val">', proj_fmt, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Value Rating</span><span class="stat-val ', val_class, '">', p_row$Value, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Surplus</span><span class="stat-val" style="color:', surplus_color, '">', surplus_fmt, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">Score</span><span class="stat-val" style="color:#f0883e;font-weight:700">', p_row$Score, '</span></div>',
        '<div class="trade-stat-row"><span class="stat-label">GP</span><span class="stat-val">', ifelse(!is.na(p_row$GP), p_row$GP, "-"), '</span></div>')

      # Add skater stats
      for(st in skater_stats) {
        val <- if(st %in% names(p_row)) p_row[[st]] else NA
        stat_rows <- paste0(stat_rows,
          '<div class="trade-stat-row"><span class="stat-label">', st, '</span><span class="stat-val">', ifelse(!is.na(val), round(val, 1), "-"), '</span></div>')
      }
      # Add goalie stats
      for(st in goalie_stats) {
        val <- if(st %in% names(p_row)) p_row[[st]] else NA
        fmt_val <- if(is.na(val)) "-" else if(st == "GAA") round(val, 2) else if(st == "SV%") round(val, 3) else round(val, 0)
        stat_rows <- paste0(stat_rows,
          '<div class="trade-stat-row"><span class="stat-label">', st, '</span><span class="stat-val">', fmt_val, '</span></div>')
      }

      cards_html <- paste0(cards_html,
        '<div class="trade-player-card"><h4>', htmltools::htmlEscape(p_row$Player), '</h4>',
        stat_rows,
        '<div class="dynasty-outlook"><h5>Dynasty Outlook</h5>',
        '<div class="outlook-row">Prime remaining: <span style="color:', prime_color, ';font-weight:600">', prime_text, '</span></div>',
        '<div class="outlook-row">Contract: <span style="color:#f0883e;font-weight:600">', contract_text, '</span></div>',
        '<div class="outlook-row">Value trend: <span style="color:', trend_color, ';font-weight:600">', trend, '</span></div>',
        '</div></div>')
    }

    # Color-code winners for numeric stats
    compare_stats <- c("Score","GP","Age","Salary_Num","Proj_Salary","Surplus",skater_stats, goalie_stats)
    # For the verdict
    scores <- sapply(player_list, function(p) ifelse(!is.na(p$Score), p$Score, 0))
    surpluses <- sapply(player_list, function(p) ifelse(!is.na(p$Surplus), p$Surplus, 0))
    ages <- sapply(player_list, function(p) ifelse(!is.na(p$Age), p$Age, 30))
    proj_vals <- sapply(player_list, function(p) ifelse(!is.na(p$Proj_Salary), p$Proj_Salary, 0))

    # Build verdict
    names_list <- sapply(player_list, function(p) p$Player)
    best_score_idx <- which.max(scores); if(length(best_score_idx)==0) best_score_idx <- 1L
    best_surplus_idx <- which.max(surpluses); if(length(best_surplus_idx)==0) best_surplus_idx <- 1L
    youngest_idx <- which.min(ages); if(length(youngest_idx)==0) youngest_idx <- 1L
    best_proj_idx <- which.max(proj_vals); if(length(best_proj_idx)==0) best_proj_idx <- 1L

    verdict_lines <- c()
    verdict_lines <- c(verdict_lines, paste0('<b style="color:#f0883e">Production:</b> ', htmltools::htmlEscape(names_list[best_score_idx]), ' leads with a score of ', scores[best_score_idx]))
    verdict_lines <- c(verdict_lines, paste0('<b style="color:#3fb950">Best Value:</b> ', htmltools::htmlEscape(names_list[best_surplus_idx]), ' has the most surplus value (', ifelse(surpluses[best_surplus_idx]>0,"+",""), '$', format(surpluses[best_surplus_idx], big.mark=",", scientific=FALSE), ')'))
    verdict_lines <- c(verdict_lines, paste0('<b style="color:#58a6ff">Dynasty Edge:</b> ', htmltools::htmlEscape(names_list[youngest_idx]), ' is youngest at age ', ages[youngest_idx]))
    verdict_lines <- c(verdict_lines, paste0('<b style="color:#a371f7">Market Value:</b> ', htmltools::htmlEscape(names_list[best_proj_idx]), ' projects highest at $', format(proj_vals[best_proj_idx], big.mark=",", scientific=FALSE)))

    # Overall winner: weighted composite (safe against identical players)
    age_range <- max(ages) - min(ages)
    composite <- scores/max(scores,1)*40 + surpluses/max(abs(surpluses),1)*25 + (if(age_range > 0) (max(ages)-ages)/age_range*20 else rep(10, length(ages))) + proj_vals/max(proj_vals,1)*15
    composite[is.na(composite)] <- 0
    overall_idx <- which.max(composite); if(length(overall_idx)==0) overall_idx <- 1L
    verdict_lines <- c(verdict_lines, paste0('<br><b style="color:#ffd700;font-size:1.1em">Overall Edge: ', htmltools::htmlEscape(names_list[overall_idx]), '</b> (composite: production 40%, value 25%, youth 20%, projection 15%)'))

    verdict_html <- paste0(
      '<div class="trade-verdict"><h4>Trade Verdict</h4><div class="verdict-text">',
      paste0(verdict_lines, collapse="<br>"),
      '</div></div>')

    HTML(paste0('<div class="trade-compare-grid">', cards_html, '</div>', verdict_html))
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # ═══ FEATURE 1: SIGNING SIMULATOR ═══
  # ══════════════════════════════════════════════════════════════════════════════

  # Fetch career GP from Hockey Reference for all MNR players with NHL GP
  observeEvent(input$sim_fetch_career_gp, {
    df <- load_all()
    if(nrow(df)==0) { showNotification("No data loaded.", type="warning"); return() }
    mnr <- df %>% filter(Contract == "MNR", Status != "FA", !is.na(GP), GP > 0)
    if(nrow(mnr)==0) { showNotification("No MNR players with NHL GP found.", type="warning"); return() }
    showNotification(paste0("Fetching career GP for ", nrow(mnr), " MNR players from Hockey Reference..."), type="message", duration=10)
    mnr_career_gp_cache$status <- "fetching"
    results <- data.frame(Player=character(), Career_GP=integer(), stringsAsFactors=FALSE)
    for(i in seq_len(nrow(mnr))) {
      row <- mnr[i,]
      cgp <- fetch_career_gp_href(row$Player)
      results <- rbind(results, data.frame(Player=row$Player, Career_GP=cgp, stringsAsFactors=FALSE))
      Sys.sleep(0.5)
    }
    mnr_career_gp_cache$data <- results
    mnr_career_gp_cache$status <- "fetched"
    showNotification(paste0("Done! Found career GP for ", sum(!is.na(results$Career_GP)), " of ", nrow(results), " MNR players."), type="message", duration=8)
  })

  output$sim_career_gp_status <- renderUI({
    status <- mnr_career_gp_cache$status
    if(status == "not_fetched") {
      div(style="color:#484f58;font-size:.75em;margin-bottom:4px;", "Career GP not fetched yet. Graduation status uses season GP as fallback.")
    } else if(status == "fetching") {
      div(style="color:#f0883e;font-size:.75em;margin-bottom:4px;", "Fetching career GP...")
    } else {
      cgp <- mnr_career_gp_cache$data
      n_found <- if(!is.null(cgp)) sum(!is.na(cgp$Career_GP)) else 0
      div(style="color:#3fb950;font-size:.75em;margin-bottom:4px;", paste0("Career GP loaded for ", n_found, " players. MNR graduation status is accurate."))
    }
  })

  # Update FA dropdown when owner changes
  observe({
    ow <- input$sim_owner
    if(is.null(ow) || ow == "(Select)") {
      updateSelectInput(session, "sim_fa_select", choices=c("(Select a team first)"))
      return()
    }
    fa <- fa_2026()
    if(nrow(fa)==0) return()
    # Available pool: other teams' expiring + available FAs + own expiring (re-sign)
    other_fa <- fa %>% filter(Status != ow) %>% mutate(Label_Prefix = "")
    my_expiring <- fa %>% filter(Status == ow, FA_Source == "Expiring") %>% mutate(Label_Prefix = "\u21bb RE-SIGN: ")
    available <- bind_rows(my_expiring, other_fa) %>% arrange(desc(Score))
    # Remove already-signed players
    signed_names <- if(length(sim_signings()) > 0) vapply(sim_signings(), function(s) s$player, character(1)) else character(0)
    available <- available %>% filter(!Player %in% signed_names)
    if(nrow(available)==0) {
      updateSelectInput(session, "sim_fa_select", choices=c("(No FAs available)"))
      return()
    }
    choices <- setNames(available$Player, paste0(available$Label_Prefix, available$Player, " (", available$`Prim Pos`, ", ", available$Team, ", Score: ", available$Score, ")"))
    updateSelectInput(session, "sim_fa_select", choices=c("(Select FA)" = "", choices))
  })

  # Update MNR dropdown when owner changes
  observe({
    ow <- input$sim_owner
    if(is.null(ow) || ow == "(Select)") {
      updateSelectInput(session, "sim_mnr_select", choices=c("(Select a team first)"))
      return()
    }
    mnr <- mnr_players()
    if(nrow(mnr)==0) {
      updateSelectInput(session, "sim_mnr_select", choices=c("(No MNR players)"))
      return()
    }
    # Filter to selected team's MNR players only
    team_mnr <- mnr %>% filter(Status == ow) %>% arrange(desc(Score))
    # Remove already-signed players
    signed_names <- if(length(sim_signings()) > 0) vapply(sim_signings(), function(s) s$player, character(1)) else character(0)
    team_mnr <- team_mnr %>% filter(!Player %in% signed_names)
    if(nrow(team_mnr)==0) {
      updateSelectInput(session, "sim_mnr_select", choices=c("(No MNR players available)"))
      return()
    }
    status_label <- ifelse(team_mnr$MNR_Status == "GRADUATED", "GRADUATED", paste0(team_mnr$Career_GP, "/", team_mnr$GP_Threshold, " GP"))
    choices <- setNames(team_mnr$Player,
      paste0(team_mnr$Player, " (", team_mnr$`Prim Pos`, ", ", team_mnr$Team, ", Score: ", round(team_mnr$Score,1), ", ", status_label, ")"))
    updateSelectInput(session, "sim_mnr_select", choices=c("(Select MNR player)" = "", choices))
  })

  # Update MNR salary default when MNR player is selected
  observeEvent(input$sim_mnr_select, {
    mnr <- mnr_players()
    if(nrow(mnr)==0) return()
    sel <- input$sim_mnr_select
    if(is.null(sel) || sel == "" || sel == "(Select a team first)" || sel == "(No MNR players)" || sel == "(No MNR players available)") return()
    player_row <- mnr %>% filter(Player == sel) %>% head(1)
    if(nrow(player_row) > 0) {
      # Graduated players default to $1.5M ELC, non-graduated default to $0
      default_sal <- if(player_row$MNR_Status == "GRADUATED") 1500000 else 0
      updateNumericInput(session, "sim_mnr_salary", value=default_sal)
    }
  })

  # Update bid salary default when FA is selected
  observeEvent(input$sim_fa_select, {
    fa <- fa_2026()
    if(nrow(fa)==0) return()
    sel <- input$sim_fa_select
    if(is.null(sel) || sel == "" || sel == "(Select a team first)" || sel == "(No FAs available)") return()
    player_row <- fa %>% filter(Player == sel) %>% head(1)
    if(nrow(player_row) > 0) {
      updateNumericInput(session, "sim_bid_salary", value=player_row$Proj_Salary)
    }
  })

  # Show cap info
  output$sim_cap_info <- renderUI({
    ow <- input$sim_owner
    if(is.null(ow) || ow == "(Select)") return(NULL)
    ac <- all_contracts()
    fa <- fa_2026()
    if(nrow(ac)==0) return(NULL)
    roster <- ac %>% filter(Status == ow)
    expiring <- fa %>% filter(Status == ow)
    locked_sal <- sum(roster$Salary_Num, na.rm=TRUE) - sum(expiring$Salary_Num, na.rm=TRUE)
    cap_space <- SALARY_CAP - locked_sal
    # Account for simulated signings
    signings <- sim_signings()
    sim_total <- safe_sum_list(signings, function(s) s$salary)
    remaining <- cap_space - sim_total
    remaining_color <- if(remaining > 10000000) "#3fb950" else if(remaining > 0) "#f0883e" else "#f85149"
    HTML(paste0(
      '<div style="padding:10px;background:#0d1117;border:1px solid #21262d;border-radius:8px;margin-bottom:10px;">',
      '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Locked Salary</div>',
      '<div style="color:#f0883e;font-size:1em;font-weight:700;">$', format(locked_sal, big.mark=",", scientific=FALSE), '</div>',
      '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;margin-top:6px;">Available Cap</div>',
      '<div style="color:#3fb950;font-size:1em;font-weight:700;">$', format(cap_space, big.mark=",", scientific=FALSE), '</div>',
      if(length(signings) > 0) paste0(
        '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;margin-top:6px;">After Signings</div>',
        '<div style="color:', remaining_color, ';font-size:1em;font-weight:700;">$', format(remaining, big.mark=",", scientific=FALSE), '</div>'
      ) else "",
      '</div>'))
  })

  # Add FA signing
  observeEvent(input$sim_add, {
    fa <- fa_2026()
    sel <- input$sim_fa_select
    if(is.null(sel) || sel == "" || sel == "(Select a team first)" || sel == "(No FAs available)" || sel == "(Select FA)") {
      showNotification("Select a free agent first", type="warning")
      return()
    }
    player_row <- fa %>% filter(Player == sel) %>% head(1)
    if(nrow(player_row)==0) return()
    bid <- input$sim_bid_salary
    if(is.na(bid) || bid < 0) bid <- 0

    current <- sim_signings()
    # Check if already signed
    if(length(current) > 0 && sel %in% vapply(current, function(s) s$player, character(1))) {
      showNotification("Player already signed", type="warning")
      return()
    }
    ow <- input$sim_owner
    is_re_sign <- !is.null(ow) && player_row$Status == ow
    new_signing <- list(
      player = player_row$Player,
      pos = player_row$`Prim Pos`,
      pt = player_row$PT,
      team = player_row$Team,
      age = player_row$Age,
      score = player_row$Score,
      salary = bid,
      proj_salary = player_row$Proj_Salary,
      re_sign = is_re_sign,
      is_mnr = FALSE,
      mnr_status = NA_character_,
      # carry stat columns
      G = if("G" %in% names(player_row)) player_row$G else NA,
      A = if("A" %in% names(player_row)) player_row$A else NA,
      `2G+A` = if("2G+A" %in% names(player_row)) player_row$`2G+A` else NA,
      PIM = if("PIM" %in% names(player_row)) player_row$PIM else NA,
      SOG = if("SOG" %in% names(player_row)) player_row$SOG else NA,
      STP = if("STP" %in% names(player_row)) player_row$STP else NA,
      Hit = if("Hit" %in% names(player_row)) player_row$Hit else NA,
      Blk = if("Blk" %in% names(player_row)) player_row$Blk else NA,
      W = if("W" %in% names(player_row)) player_row$W else NA,
      GAA = if("GAA" %in% names(player_row)) player_row$GAA else NA,
      `SV%` = if("SV%" %in% names(player_row)) player_row$`SV%` else NA,
      SHO = if("SHO" %in% names(player_row)) player_row$SHO else NA
    )
    current[[length(current)+1]] <- new_signing
    sim_signings(current)
  })

  # Add MNR/ELC signing
  observeEvent(input$sim_add_mnr, {
    mnr <- mnr_players()
    sel <- input$sim_mnr_select
    if(is.null(sel) || sel == "" || sel == "(Select a team first)" || sel == "(No MNR players)" || sel == "(No MNR players available)" || sel == "(Select MNR player)") {
      showNotification("Select an ELC/MNR player first", type="warning")
      return()
    }
    player_row <- mnr %>% filter(Player == sel) %>% head(1)
    if(nrow(player_row)==0) return()
    bid <- input$sim_mnr_salary
    if(is.na(bid) || bid < 0) bid <- 0

    current <- sim_signings()
    # Check if already signed
    if(length(current) > 0 && sel %in% vapply(current, function(s) s$player, character(1))) {
      showNotification("Player already added", type="warning")
      return()
    }
    new_signing <- list(
      player = player_row$Player,
      pos = player_row$`Prim Pos`,
      pt = player_row$PT,
      team = player_row$Team,
      age = player_row$Age,
      score = player_row$Score,
      salary = bid,
      proj_salary = if(!is.na(player_row$Score) && player_row$Score > 0) project_salary(player_row$Score, player_row$Age, player_row$`Prim Pos`) else 0,
      re_sign = FALSE,
      is_mnr = TRUE,
      mnr_status = player_row$MNR_Status,
      # carry stat columns
      G = if("G" %in% names(player_row)) player_row$G else NA,
      A = if("A" %in% names(player_row)) player_row$A else NA,
      `2G+A` = if("2G+A" %in% names(player_row)) player_row$`2G+A` else NA,
      PIM = if("PIM" %in% names(player_row)) player_row$PIM else NA,
      SOG = if("SOG" %in% names(player_row)) player_row$SOG else NA,
      STP = if("STP" %in% names(player_row)) player_row$STP else NA,
      Hit = if("Hit" %in% names(player_row)) player_row$Hit else NA,
      Blk = if("Blk" %in% names(player_row)) player_row$Blk else NA,
      W = if("W" %in% names(player_row)) player_row$W else NA,
      GAA = if("GAA" %in% names(player_row)) player_row$GAA else NA,
      `SV%` = if("SV%" %in% names(player_row)) player_row$`SV%` else NA,
      SHO = if("SHO" %in% names(player_row)) player_row$SHO else NA
    )
    current[[length(current)+1]] <- new_signing
    sim_signings(current)
  })

  # Clear signings when owner changes
  observeEvent(input$sim_owner, {
    sim_signings(list())
  })

  # Remove signing buttons - use single observer checking all remove inputs
  observe({
    signings <- sim_signings()
    if(length(signings) == 0) return()
    for(i in seq_along(signings)) {
      local({
        idx <- i
        observeEvent(input[[paste0("sim_remove_", idx)]], {
          current <- isolate(sim_signings())
          if(idx <= length(current)) {
            current[[idx]] <- NULL
            sim_signings(current)
          }
        }, ignoreInit=TRUE, once=TRUE)
      })
    }
  })

  # Signings list UI
  output$sim_signings_list <- renderUI({
    signings <- sim_signings()
    if(length(signings)==0) return(div(style="color:#484f58;font-size:.85em;text-align:center;padding:10px;", "No signings yet. Add players above."))
    items <- lapply(seq_along(signings), function(i) {
      s <- signings[[i]]
      sal_fmt <- if(s$salary == 0) "$0" else paste0("$", format(s$salary, big.mark=",", scientific=FALSE))
      is_mnr <- isTRUE(s$is_mnr)
      prefix <- if(isTRUE(s$re_sign)) "\u21bb " else if(is_mnr) "\u2b50 " else ""
      type_label <- if(isTRUE(s$re_sign)) "RE-SIGN | " else if(is_mnr) paste0("ELC/MNR", if(!is.na(s$mnr_status)) paste0(" (", s$mnr_status, ")") else "", " | ") else ""
      item_style <- if(is_mnr) "border-color:#238636;" else ""
      div(class="sim-signing-item", style=item_style,
        div(class="player-info",
          div(class="player-name", style=if(is_mnr) "color:#3fb950;" else "", paste0(prefix, s$player)),
          div(class="player-detail", paste0(type_label, s$pos, " | ", s$team, " | ", sal_fmt))
        ),
        actionButton(paste0("sim_remove_", i), "X", class="sim-remove-btn")
      )
    })
    tagList(
      div(style="color:#f0883e;font-size:.82em;font-weight:600;margin-bottom:6px;", paste0("Signings (", length(signings), ")")),
      items
    )
  })

  # Main simulator results
  output$sim_results <- renderUI({
    ow <- input$sim_owner
    if(is.null(ow) || ow == "(Select)") return(div(class="sim-section", h5("Select a team to begin"), p("Choose your team from the sidebar to start planning your offseason.", style="color:#484f58;")))

    ac <- all_contracts()
    fa <- fa_2026()
    if(nrow(ac)==0) return(NULL)

    signings <- sim_signings()

    # Current roster = non-expiring players
    roster <- ac %>% filter(Status == ow)
    expiring <- fa %>% filter(Status == ow)
    locked_roster <- roster %>% filter(!Player %in% expiring$Player)
    locked_sal <- sum(locked_roster$Salary_Num, na.rm=TRUE)

    # Before roster: all current players
    before_f <- sum(roster$`Prim Pos`=="F", na.rm=TRUE)
    before_d <- sum(roster$`Prim Pos`=="D", na.rm=TRUE)
    before_g <- sum(roster$PT=="Goalie", na.rm=TRUE)
    before_total <- nrow(roster)
    before_sal <- sum(roster$Salary_Num, na.rm=TRUE)

    # After roster: locked + signings
    after_f <- sum(locked_roster$`Prim Pos`=="F", na.rm=TRUE) + safe_count_list(signings, function(s) s$pos == "F")
    after_d <- sum(locked_roster$`Prim Pos`=="D", na.rm=TRUE) + safe_count_list(signings, function(s) s$pos == "D")
    after_g <- sum(locked_roster$PT=="Goalie", na.rm=TRUE) + safe_count_list(signings, function(s) s$pt == "Goalie")
    after_total <- nrow(locked_roster) + length(signings)
    sim_sal <- safe_sum_list(signings, function(s) s$salary)
    after_sal <- locked_sal + sim_sal
    cap_pct <- round(after_sal / SALARY_CAP * 100, 1)
    cap_color <- if(cap_pct > 100) "#f85149" else if(cap_pct > 85) "#f0883e" else "#3fb950"

    # ── Category ranking comparison ──
    # Build league-wide category totals
    all_rostered <- ac
    sk_cats <- c("G","A","2G+A","PIM","SOG","STP","Hit","Blk")
    owners <- sort(unique(all_rostered$Status))

    # Before: each team's stats as-is
    before_team_stats <- list()
    for(o in owners) {
      team_r <- all_rostered %>% filter(Status == o, PT == "Skater")
      stats <- sapply(sk_cats, function(cat) {
        if(cat %in% names(team_r)) sum(team_r[[cat]], na.rm=TRUE) else 0
      })
      before_team_stats[[o]] <- stats
    }

    # After: for the selected owner, remove expiring skaters & add signed skaters
    after_team_stats <- before_team_stats
    # Start from locked roster for selected owner
    locked_sk <- locked_roster %>% filter(PT == "Skater")
    owner_stats_after <- sapply(sk_cats, function(cat) {
      base <- if(cat %in% names(locked_sk)) sum(locked_sk[[cat]], na.rm=TRUE) else 0
      signed <- safe_sum_list(signings, function(s) {
        if(s$pt != "Goalie" && !is.null(s[[cat]]) && !is.na(s[[cat]])) as.numeric(s[[cat]]) else 0
      })
      base + signed
    })
    after_team_stats[[ow]] <- owner_stats_after

    # Compute ranks before and after
    cat_rank_html <- ""
    for(cat in sk_cats) {
      before_vals <- sapply(owners, function(o) before_team_stats[[o]][cat])
      before_rank <- rank(-before_vals, ties.method="min")[which(owners == ow)]

      after_vals <- sapply(owners, function(o) after_team_stats[[o]][cat])
      after_rank <- rank(-after_vals, ties.method="min")[which(owners == ow)]

      change <- before_rank - after_rank
      arrow <- if(change > 0) paste0('<span class="arrow-up">+', change, '</span>') else if(change < 0) paste0('<span class="arrow-down">', change, '</span>') else '<span class="arrow-same">--</span>'

      rank_color_b <- if(before_rank <= 3) "#ffd700" else if(before_rank <= 5) "#3fb950" else if(before_rank <= 10) "#8b949e" else "#f85149"
      rank_color_a <- if(after_rank <= 3) "#ffd700" else if(after_rank <= 5) "#3fb950" else if(after_rank <= 10) "#8b949e" else "#f85149"

      cat_rank_html <- paste0(cat_rank_html,
        '<div class="sim-cat-row">',
        '<div class="cat-name">', cat, '</div>',
        '<div class="rank-before" style="color:', rank_color_b, ';font-weight:700;">#', before_rank, '</div>',
        '<div class="rank-arrow">', arrow, '</div>',
        '<div class="rank-after" style="color:', rank_color_a, ';font-weight:700;">#', after_rank, '</div>',
        '</div>')
    }

    # ── Roster after signings table ──
    roster_rows_html <- ""
    # Locked players
    for(i in seq_len(nrow(locked_roster))) {
      r <- locked_roster[i, ]
      roster_rows_html <- paste0(roster_rows_html,
        '<tr><td style="color:#c9d1d9;font-weight:600;">', htmltools::htmlEscape(r$Player), '</td>',
        '<td>', r$`Prim Pos`, '</td><td>', r$Team, '</td><td>', r$Age, '</td>',
        '<td style="color:#f0883e;">', round(r$Score, 1), '</td>',
        '<td>$', format(r$Salary_Num, big.mark=",", scientific=FALSE), '</td>',
        '<td><span class="badge-locked">LOCKED</span></td></tr>')
    }
    # Signed players (FA signings and MNR/ELC additions)
    for(s in signings) {
      is_mnr <- isTRUE(s$is_mnr)
      tier <- if(is_mnr && s$salary == 0) "MNR $0" else project_contract_tier(s$salary)
      status_label <- if(is_mnr) paste0("ELC/MNR (", tier, ")") else paste0("NEW SIGNING (", tier, ")")
      status_color <- if(is_mnr) "#3fb950" else "#3fb950"
      row_bg <- if(is_mnr) "background:rgba(35,134,54,.10)!important;" else "background:rgba(63,185,80,.08)!important;"
      roster_rows_html <- paste0(roster_rows_html,
        '<tr style="', row_bg, '"><td style="color:#3fb950;font-weight:700;">', htmltools::htmlEscape(s$player), '</td>',
        '<td>', s$pos, '</td><td>', s$team, '</td><td>', s$age, '</td>',
        '<td style="color:#f0883e;">', round(s$score, 1), '</td>',
        '<td style="color:#3fb950;">', if(s$salary == 0) "$0" else paste0("$", format(s$salary, big.mark=",", scientific=FALSE)), '</td>',
        '<td><span style="color:', status_color, ';font-weight:700;">', status_label, '</span></td></tr>')
    }

    HTML(paste0(
      '<div class="sim-comparison">',
      # Left column: category ranks & roster composition
      '<div class="sim-col">',
        '<div class="sim-section">',
        '<h5>Category Rankings: Before vs After</h5>',
        '<div style="display:flex;padding:4px 0;font-size:.72em;color:#484f58;text-transform:uppercase;">',
        '<div style="width:60px;">Cat</div><div style="width:50px;text-align:center;">Before</div>',
        '<div style="width:40px;text-align:center;">Chg</div><div style="width:50px;text-align:center;">After</div></div>',
        cat_rank_html,
        '</div>',
        '<div class="sim-section">',
        '<h5>Roster Composition</h5>',
        '<div style="display:flex;gap:20px;">',
        '<div style="flex:1;text-align:center;padding:8px;background:#0d1117;border-radius:6px;">',
          '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Before</div>',
          '<div style="color:#c9d1d9;font-weight:600;">', before_f, 'F / ', before_d, 'D / ', before_g, 'G</div>',
          '<div style="color:#484f58;font-size:.8em;">Total: ', before_total, '</div></div>',
        '<div style="flex:1;text-align:center;padding:8px;background:#0d1117;border-radius:6px;">',
          '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">After</div>',
          '<div style="color:#3fb950;font-weight:600;">', after_f, 'F / ', after_d, 'D / ', after_g, 'G</div>',
          '<div style="color:#484f58;font-size:.8em;">Total: ', after_total, ' / 23</div></div>',
        '</div></div>',
      '</div>',

      # Right column: salary & roster table
      '<div class="sim-col">',
        '<div class="sim-section">',
        '<h5>Salary Impact</h5>',
        '<div style="display:flex;gap:16px;margin-bottom:10px;">',
        '<div style="flex:1;text-align:center;padding:8px;background:#0d1117;border-radius:6px;">',
          '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">Before</div>',
          '<div style="color:#f0883e;font-weight:700;">$', format(before_sal, big.mark=",", scientific=FALSE), '</div></div>',
        '<div style="flex:1;text-align:center;padding:8px;background:#0d1117;border-radius:6px;">',
          '<div style="color:#8b949e;font-size:.75em;text-transform:uppercase;">After</div>',
          '<div style="color:', cap_color, ';font-weight:700;">$', format(after_sal, big.mark=",", scientific=FALSE), '</div></div>',
        '</div>',
        '<div class="cap-track"><div class="cap-fill" style="background:linear-gradient(90deg,', cap_color, ',', cap_color, ');width:', min(100, cap_pct), '%;"></div>',
        '<div class="cap-label">', cap_pct, '% of $104M cap</div></div>',
        '<div style="text-align:center;margin-top:6px;color:#8b949e;font-size:.82em;">Remaining: <b style="color:', cap_color, '">$', format(SALARY_CAP - after_sal, big.mark=",", scientific=FALSE), '</b></div>',
        '</div>',
        '<div class="sim-section">',
        '<h5>Roster After Signings</h5>',
        '<div style="max-height:400px;overflow-y:auto;">',
        '<table style="width:100%;border-collapse:collapse;">',
        '<thead><tr style="border-bottom:2px solid #30363d;">',
        '<th style="padding:6px 8px;text-align:left;color:#f0883e;font-size:.78em;">Player</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Pos</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Team</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Age</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Score</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Salary</th>',
        '<th style="padding:6px 8px;color:#f0883e;font-size:.78em;">Status</th>',
        '</tr></thead><tbody>', roster_rows_html, '</tbody></table></div>',
        '</div>',
      '</div>',
      '</div>'
    ))
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # ═══ FEATURE 2: BUDGET PLANNER ═══
  # ══════════════════════════════════════════════════════════════════════════════

  output$bp_table <- renderDT({
    ac <- all_contracts(); fa <- fa_2026()
    if(nrow(ac)==0) return(datatable(data.frame(Message="No data"),rownames=FALSE))
    owners <- sort(unique(ac$Status))
    bp_data <- lapply(owners, function(ow) {
      roster <- ac %>% filter(Status == ow)
      expiring <- fa %>% filter(Status == ow)
      locked <- roster %>% filter(!Player %in% expiring$Player)
      locked_sal <- sum(locked$Salary_Num, na.rm=TRUE)
      filled <- nrow(locked)
      spots_to_fill <- max(0, ROSTER_SIZE - filled)
      available_budget <- SALARY_CAP - locked_sal
      avg_per_spot <- if(spots_to_fill > 0) round(available_budget / spots_to_fill) else 0
      # Position needs
      rem_f <- sum(locked$`Prim Pos`=="F", na.rm=TRUE)
      rem_d <- sum(locked$`Prim Pos`=="D", na.rm=TRUE)
      rem_g <- sum(locked$PT=="Goalie", na.rm=TRUE)
      need_f <- max(0, 12 - rem_f)
      need_d <- max(0, 6 - rem_d)
      need_g <- max(0, 2 - rem_g)
      tier <- if(available_budget > 30000000) "Big Spender" else if(available_budget > 20000000) "Comfortable" else if(available_budget > 10000000) "Tight" else "Strapped"
      data.frame(
        Owner = ow, Locked_Sal = locked_sal, Filled = filled, Open = spots_to_fill,
        Need_F = need_f, Need_D = need_d, Need_G = need_g,
        Available = available_budget, Avg_Per_Spot = avg_per_spot, Tier = tier,
        stringsAsFactors = FALSE
      )
    }) %>% bind_rows() %>% arrange(desc(Available))

    datatable(bp_data, rownames=FALSE, selection="single",
      colnames=c("Owner","Locked Salary","Filled","Open Spots","Need F","Need D","Need G","Available Budget","Avg $/Spot","Budget Tier"),
      options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(7,'desc')))) %>%
      formatCurrency(c("Locked_Sal","Available","Avg_Per_Spot"),currency="$",digits=0) %>%
      formatStyle('Tier',
        backgroundColor=styleEqual(c("Big Spender","Comfortable","Tight","Strapped"),c("#0a3d1a","#1a2d4a","#3d2a0a","#3d1418")),
        color=styleEqual(c("Big Spender","Comfortable","Tight","Strapped"),c("#3fb950","#58a6ff","#f0883e","#f85149")),
        fontWeight='bold') %>%
      formatStyle('Available',background=styleColorBar(range(bp_data$Available),'rgba(63,185,80,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$bp_detail <- renderUI({
    sel <- input$bp_table_rows_selected
    if(is.null(sel)) return(NULL)
    ac <- all_contracts(); fa <- fa_2026()
    if(nrow(ac)==0) return(NULL)
    owners <- sort(unique(ac$Status))
    # Rebuild data to get sorted order
    bp_data <- lapply(owners, function(ow) {
      roster <- ac %>% filter(Status == ow)
      expiring <- fa %>% filter(Status == ow)
      locked <- roster %>% filter(!Player %in% expiring$Player)
      locked_sal <- sum(locked$Salary_Num, na.rm=TRUE)
      filled <- nrow(locked)
      spots_to_fill <- max(0, ROSTER_SIZE - filled)
      available_budget <- SALARY_CAP - locked_sal
      avg_per_spot <- if(spots_to_fill > 0) round(available_budget / spots_to_fill) else 0
      rem_f <- sum(locked$`Prim Pos`=="F", na.rm=TRUE)
      rem_d <- sum(locked$`Prim Pos`=="D", na.rm=TRUE)
      rem_g <- sum(locked$PT=="Goalie", na.rm=TRUE)
      need_f <- max(0, 12 - rem_f)
      need_d <- max(0, 6 - rem_d)
      need_g <- max(0, 2 - rem_g)
      tier <- if(available_budget > 30000000) "Big Spender" else if(available_budget > 20000000) "Comfortable" else if(available_budget > 10000000) "Tight" else "Strapped"
      data.frame(Owner=ow, Locked_Sal=locked_sal, Filled=filled, Open=spots_to_fill,
        Need_F=need_f, Need_D=need_d, Need_G=need_g,
        Available=available_budget, Avg_Per_Spot=avg_per_spot, Tier=tier,
        stringsAsFactors=FALSE)
    }) %>% bind_rows() %>% arrange(desc(Available))

    if(sel > nrow(bp_data)) return(NULL)
    r <- bp_data[sel, ]
    ow <- r$Owner

    locked_roster <- ac %>% filter(Status == ow) %>% filter(!Player %in% (fa %>% filter(Status==ow) %>% pull(Player)))
    cap_pct <- round(r$Locked_Sal / SALARY_CAP * 100, 1)
    avail_pct <- 100 - cap_pct

    tier_color <- switch(r$Tier, "Big Spender"="#3fb950", "Comfortable"="#58a6ff", "Tight"="#f0883e", "#f85149")
    tier_class <- switch(r$Tier, "Big Spender"="budget-tier-big", "Comfortable"="budget-tier-comfy", "Tight"="budget-tier-tight", "budget-tier-strapped")

    # Top locked players
    top_locked <- locked_roster %>% arrange(desc(Score)) %>% head(8)
    locked_html <- if(nrow(top_locked) > 0) paste0(
      sapply(seq_len(nrow(top_locked)), function(i) {
        p <- top_locked[i, ]
        paste0('<div class="needs-row"><b>', htmltools::htmlEscape(p$Player), '</b> \u2014 ', p$`Prim Pos`,
          ', Age ', p$Age, ', Score: <b style="color:#f0883e">', round(p$Score, 1), '</b>',
          ' \u2022 $', format(p$Salary_Num, big.mark=",", scientific=FALSE),
          ' (', p$Contract_Yrs, ' yr)</div>')
      }), collapse="") else ""

    HTML(paste0(
      '<div class="budget-card"><h4>', htmltools::htmlEscape(ow), ' \u2014 Budget Breakdown</h4>',
      '<div class="meta">Budget tier: <span class="', tier_class, '">', r$Tier, '</span> \u2022 ',
      r$Open, ' roster spots to fill \u2022 Avg $', format(r$Avg_Per_Spot, big.mark=",", scientific=FALSE), ' per spot</div>',
      '<div class="cap-meter" style="margin-top:12px;">',
      '<h5>Cap Allocation</h5>',
      '<div class="cap-track">',
      '<div class="cap-fill" style="background:linear-gradient(90deg,#f0883e,#d97218);width:', cap_pct, '%;"></div>',
      '<div class="cap-label">', cap_pct, '% locked \u2022 ', round(avail_pct, 1), '% available</div>',
      '</div></div>',
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">',
      '<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:#0d1117;border-radius:8px;">',
        '<div style="color:#8b949e;font-size:.72em;text-transform:uppercase;">Locked</div>',
        '<div style="color:#f0883e;font-weight:700;">$', format(r$Locked_Sal, big.mark=",", scientific=FALSE), '</div></div>',
      '<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:#0d1117;border-radius:8px;">',
        '<div style="color:#8b949e;font-size:.72em;text-transform:uppercase;">Available</div>',
        '<div style="color:', tier_color, ';font-weight:700;">$', format(r$Available, big.mark=",", scientific=FALSE), '</div></div>',
      '<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:#0d1117;border-radius:8px;">',
        '<div style="color:#8b949e;font-size:.72em;text-transform:uppercase;">Filled</div>',
        '<div style="color:#c9d1d9;font-weight:700;">', r$Filled, ' / 23</div></div>',
      '<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:#0d1117;border-radius:8px;">',
        '<div style="color:#8b949e;font-size:.72em;text-transform:uppercase;">Needs</div>',
        '<div style="color:#c9d1d9;font-weight:700;">', r$Need_F, 'F / ', r$Need_D, 'D / ', r$Need_G, 'G</div></div>',
      '</div>',
      '<div class="rec-section" style="margin-top:14px;"><h5>Top Locked Players</h5>', locked_html, '</div>',
      '</div>'))
  })

  # ══════════════════════════════════════════════════════════════════════════════
  # ═══ FEATURE 3: TRADE BLOCK IDENTIFIER ═══
  # ══════════════════════════════════════════════════════════════════════════════

  output$tb_summary_stats <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0) return(NULL)
    tb <- ac %>% filter(!is.na(Trade_Block))
    n_untouchable <- sum(tb$Trade_Block == "Untouchable", na.rm=TRUE)
    n_sell <- sum(tb$Trade_Block == "Sell High", na.rm=TRUE)
    n_buy <- sum(tb$Trade_Block == "Buy Low", na.rm=TRUE)
    n_dead <- sum(tb$Trade_Block == "Dead Weight", na.rm=TRUE)
    div(class="stat-bar",
      div(class="stat-box", div(class="num", style="color:#58a6ff", n_untouchable), div(class="lbl", "Untouchable")),
      div(class="stat-box", div(class="num", style="color:#ffd700", n_sell), div(class="lbl", "Sell High")),
      div(class="stat-box", div(class="num", style="color:#3fb950", n_buy), div(class="lbl", "Buy Low")),
      div(class="stat-box", div(class="num", style="color:#f85149", n_dead), div(class="lbl", "Dead Weight"))
    )
  })

  output$tb_cards <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0) return(div(class="sim-section", h5("Upload data to see trade block classifications")))
    tb <- ac %>% filter(!is.na(Trade_Block))

    ow_filter <- input$tb_owner
    if(!is.null(ow_filter) && ow_filter != "All") tb <- tb %>% filter(Status == ow_filter)

    cat_filter <- input$tb_category
    if(!is.null(cat_filter) && cat_filter != "All") tb <- tb %>% filter(Trade_Block == cat_filter)

    if(nrow(tb)==0) return(div(class="sim-section", h5("No trade block candidates match filters"), p("Try different filters.", style="color:#484f58;")))

    categories <- c("Untouchable", "Sell High", "Buy Low", "Dead Weight")
    cat_configs <- list(
      "Untouchable" = list(color="#58a6ff", badge="tb-badge-untouchable", icon="Shield",
        desc="Core dynasty assets. Elite or great value, age 25 or under, locked in for 3+ years. Do not trade."),
      "Sell High" = list(color="#ffd700", badge="tb-badge-sell", icon="Chart",
        desc="Producing at elite/great value now, but age 29+ on 3+ year deals. Trade while value is high before decline sets in."),
      "Buy Low" = list(color="#3fb950", badge="tb-badge-buy", icon="Target",
        desc="Overpaid or underperforming players age 25 or under. May be struggling now but have upside. Buy at a discount."),
      "Dead Weight" = list(color="#f85149", badge="tb-badge-dead", icon="Warning",
        desc="Bad value contracts for players age 30+ with 3+ years remaining. Difficult to move, no light at the end of the tunnel.")
    )

    sections_html <- ""
    for(cat in categories) {
      cat_players <- tb %>% filter(Trade_Block == cat) %>% arrange(desc(Score))
      if(nrow(cat_players)==0) next
      cfg <- cat_configs[[cat]]

      player_rows <- paste0(sapply(seq_len(nrow(cat_players)), function(i) {
        p <- cat_players[i, ]
        val_class <- case_when(
          p$Value=="ELITE VALUE" ~ "val-elite", p$Value=="Great Value" ~ "val-great",
          p$Value=="Good Value" ~ "val-good", p$Value=="Fair" ~ "val-fair",
          p$Value=="Overpaid" ~ "val-over", p$Value=="Bad Value" ~ "val-bad", TRUE ~ "val-terrible")
        paste0('<div class="tb-player-row">',
          '<div style="flex:1;">',
            '<span style="color:#c9d1d9;font-weight:600;">', htmltools::htmlEscape(p$Player), '</span>',
            ' <span style="color:#484f58;">|</span> ',
            '<span style="color:#8b949e;">', p$`Prim Pos`, ' | ', p$Team, ' | Age ', p$Age, '</span>',
          '</div>',
          '<div style="display:flex;gap:12px;align-items:center;">',
            '<span style="color:#f0883e;font-weight:600;">Score: ', round(p$Score, 1), '</span>',
            '<span style="color:#8b949e;">', p$Salary_Display, '</span>',
            '<span style="color:#8b949e;">', p$Contract_Yrs, 'yr</span>',
            '<span class="', val_class, '">', p$Value, '</span>',
            '<span style="color:#8b949e;">', htmltools::htmlEscape(as.character(p$Status)), '</span>',
          '</div></div>')
      }), collapse="")

      sections_html <- paste0(sections_html,
        '<div class="tb-category" style="margin-bottom:24px;">',
        '<h4 style="color:', cfg$color, ';">', cat, ' (', nrow(cat_players), ')</h4>',
        '<div style="color:#8b949e;font-size:.82em;margin-bottom:10px;">', cfg$desc, '</div>',
        player_rows, '</div>')
    }

    HTML(paste0('<div class="cat-card">', sections_html, '</div>'))
  })

  # ═══ STAT CATEGORY ANALYSIS ═══
  cat_standings <- reactive({
    df <- load_all()
    if(nrow(df)==0) return(list())
    rostered <- df %>% filter(Contract=="BID")
    if(nrow(rostered)==0) return(list())
    sk <- rostered %>% filter(PT=="Skater")
    sk_cats <- c("G","A","2G+A","PIM","SOG","STP","Hit","Blk")
    sk_agg <- sk %>% group_by(Owner=Status) %>%
      summarise(across(any_of(sk_cats), ~sum(., na.rm=TRUE)), Sk_Score=sum(Score,na.rm=TRUE), Sk_Count=n(), .groups="drop")
    gl <- rostered %>% filter(PT=="Goalie")
    gl_agg <- gl %>% group_by(Owner=Status) %>%
      summarise(W=sum(W,na.rm=TRUE), GAA=mean(GAA,na.rm=TRUE), `SV%`=mean(`SV%`,na.rm=TRUE), SHO=sum(SHO,na.rm=TRUE), .groups="drop")
    combined <- sk_agg %>% full_join(gl_agg, by="Owner")
    for(col in sk_cats) if(col %in% names(combined)) combined[[col]][is.na(combined[[col]])] <- 0
    for(col in c("W","SHO")) if(col %in% names(combined)) combined[[col]][is.na(combined[[col]])] <- 0
    all_cats <- c(sk_cats, "W","GAA","SV%","SHO")
    ranks <- data.frame(Owner=combined$Owner, stringsAsFactors=FALSE)
    for(cat in all_cats){
      if(!cat %in% names(combined)) next
      vals <- combined[[cat]]
      ranks[[cat]] <- if(cat=="GAA") rank(vals,ties.method="min",na.last="keep") else rank(-vals,ties.method="min",na.last="keep")
    }
    list(combined=combined, ranks=ranks, all_cats=all_cats, sk_cats=sk_cats)
  })

  output$ca_summary_stats <- renderUI({
    cs <- cat_standings(); if(length(cs)==0) return(NULL)
    ranks <- cs$ranks; n_teams <- nrow(ranks)
    best_cat_team <- ranks$Owner[which.max(rowSums(ranks[,-1]==1,na.rm=TRUE))]
    best_cat_count <- max(rowSums(ranks[,-1]==1,na.rm=TRUE))
    avg_ranks <- rowMeans(ranks[,-1],na.rm=TRUE)
    most_balanced <- ranks$Owner[which.min(avg_ranks)]
    bal_avg <- round(min(avg_ranks),1)
    div(class="stat-bar",
      div(class="stat-box",div(class="num",n_teams),div(class="lbl","Teams")),
      div(class="stat-box",div(class="num",ncol(ranks)-1),div(class="lbl","Categories")),
      div(class="stat-box",div(class="num",style="color:#ffd700",best_cat_team),div(class="lbl",paste0(best_cat_count," 1st Places"))),
      div(class="stat-box",div(class="num",style="color:#3fb950",most_balanced),div(class="lbl",paste0("Best Avg Rank: ",bal_avg))))
  })

  output$ca_heatmap <- renderDT({
    cs <- cat_standings(); if(length(cs)==0) return(datatable(data.frame(Message="No data"),rownames=FALSE))
    ranks <- cs$ranks; combined <- cs$combined; all_cats <- cs$all_cats
    display <- data.frame(Owner=combined$Owner, stringsAsFactors=FALSE)
    for(cat in all_cats){
      if(!cat %in% names(combined)) next
      vals <- combined[[cat]]; rks <- ranks[[cat]]
      display[[cat]] <- if(cat=="GAA") ifelse(is.na(vals),"-",paste0(round(vals,2)," (#",rks,")")) else if(cat=="SV%") ifelse(is.na(vals),"-",paste0(round(vals,3)," (#",rks,")")) else ifelse(is.na(vals),"-",paste0(round(vals,0)," (#",rks,")"))
    }
    display$Avg_Rank <- round(rowMeans(ranks[,-1],na.rm=TRUE),1)
    display <- display %>% arrange(Avg_Rank)
    datatable(display,rownames=FALSE,selection="single",options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(ncol(display)-1,'asc'))),class="cat-heatmap") %>%
      formatStyle('Avg_Rank',background=styleColorBar(range(display$Avg_Rank),'rgba(240,136,62,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  observeEvent(input$ca_heatmap_rows_selected,{
    sel<-input$ca_heatmap_rows_selected;if(!is.null(sel)){cs<-cat_standings();if(length(cs)>0){ranks<-cs$ranks;avg_rk<-round(rowMeans(ranks[,-1],na.rm=TRUE),1);sorted_owners<-ranks$Owner[order(avg_rk)];if(sel<=length(sorted_owners))updateSelectInput(session,"ca_owner",selected=sorted_owners[sel])}}
  })

  output$ca_owner_detail <- renderUI({
    ow <- input$ca_owner; if(is.null(ow)||ow=="(All Teams)") return(NULL)
    cs <- cat_standings(); if(length(cs)==0) return(NULL)
    combined <- cs$combined; ranks <- cs$ranks; all_cats <- cs$all_cats; n_teams <- nrow(ranks)
    ow_row <- which(combined$Owner==ow); if(length(ow_row)==0) return(NULL)
    cats_info <- lapply(all_cats,function(cat){if(!cat%in%names(combined))return(NULL);val<-combined[[cat]][ow_row];rk<-ranks[[cat]][ow_row];if(is.na(rk))return(NULL);val_fmt<-if(cat=="GAA")round(val,2)else if(cat=="SV%")round(val,3)else round(val,0);tier<-if(rk==1)"elite"else if(rk<=3)"strong"else if(rk<=n_teams-5)"avg"else if(rk<=n_teams-2)"weak"else"crit";label<-if(rk==1)"1st"else if(rk==2)"2nd"else if(rk==3)"3rd"else paste0(rk,"th");list(cat=cat,val=val_fmt,rank=rk,label=label,tier=tier)})
    cats_info <- Filter(Negate(is.null),cats_info)
    strengths <- Filter(function(x)x$tier%in%c("elite","strong"),cats_info)
    weaknesses <- Filter(function(x)x$tier%in%c("weak","crit"),cats_info)
    middle <- Filter(function(x)x$tier=="avg",cats_info)
    str_html <- if(length(strengths)>0) paste0('<h4 style="color:#3fb950;margin-top:14px;font-weight:700;">Strengths</h4>',paste0(sapply(strengths,function(x){cls<-if(x$tier=="elite")"str-elite"else"str-strong";paste0('<span class="strength-tag ',cls,'">',x$cat,': ',x$val,' (',x$label,')</span>')}),collapse="")) else ""
    weak_html <- if(length(weaknesses)>0) paste0('<h4 style="color:#f85149;margin-top:14px;font-weight:700;">Weaknesses</h4>',paste0(sapply(weaknesses,function(x){cls<-if(x$tier=="crit")"str-crit"else"str-weak";paste0('<span class="strength-tag ',cls,'">',x$cat,': ',x$val,' (',x$label,')</span>')}),collapse="")) else ""
    mid_html <- if(length(middle)>0) paste0('<h4 style="color:#8b949e;margin-top:14px;font-weight:700;">Middle of Pack</h4>',paste0(sapply(middle,function(x)paste0('<span class="strength-tag str-avg">',x$cat,': ',x$val,' (',x$label,')</span>')),collapse="")) else ""

    # FA targets for weaknesses
    rec_html <- ""
    if(length(weaknesses)>0){
      fa <- fa_2026() %>% filter(Status!=ow)
      if(nrow(fa)>0){
        weak_cats <- sapply(weaknesses,function(x)x$cat)
        sk_weak <- intersect(weak_cats,cs$sk_cats)
        if(length(sk_weak)>0){
          fa_sk <- fa %>% filter(PT=="Skater"); if(nrow(fa_sk)>0){
            fa_sk$weak_score <- 0; for(wc in sk_weak){if(wc%in%names(fa_sk)){cv<-fa_sk[[wc]];cv[is.na(cv)]<-0;mx<-max(cv,na.rm=TRUE);if(mx>0)fa_sk$weak_score<-fa_sk$weak_score+(cv/mx*100)}}
            top_t <- fa_sk %>% arrange(desc(weak_score)) %>% head(8)
            if(nrow(top_t)>0) rec_html <- paste0('<div class="rec-section" style="margin-top:18px;"><h5>FA Targets for Weaknesses (',paste(sk_weak,collapse=", "),')</h5>',paste0('<div class="needs-row"><b>',htmltools::htmlEscape(top_t$Player),'</b> (',top_t$Team,') \u2014 ',top_t$`Prim Pos`,', Age ',top_t$Age,', Score: <b style="color:#f0883e">',top_t$Score,'</b> \u2022 Proj: $',format(top_t$Proj_Salary,big.mark=",",scientific=FALSE),'</div>',collapse=""),'</div>')
          }
        }
      }
    }
    avg_rk <- round(mean(sapply(all_cats,function(cat)if(cat%in%names(ranks))ranks[[cat]][ow_row]else NA),na.rm=TRUE),1)
    overall_rank <- rank(rowMeans(ranks[,-1],na.rm=TRUE))[ow_row]
    ordinal <- if(overall_rank==1)"1st"else if(overall_rank==2)"2nd"else if(overall_rank==3)"3rd"else paste0(overall_rank,"th")
    HTML(paste0('<div class="cat-card"><h4>',htmltools::htmlEscape(ow),' \u2014 Category Breakdown</h4><div class="meta">Overall rank: <b style="color:#f0883e">',ordinal,'</b> of ',n_teams,' (avg rank: ',avg_rk,')</div>',str_html,weak_html,mid_html,rec_html,'</div>'))
  })

  # ═══ LEAGUE OVERVIEW ═══

  # ═══ POWER RANKINGS ═══
  output$lo_power_rankings <- renderUI({
    ac <- all_contracts()
    if(nrow(ac)==0) return(NULL)

    owners <- sort(unique(ac$Status))
    pr_data <- lapply(owners, function(ow) {
      team <- ac %>% filter(Status == ow)
      total_score <- sum(team$Score, na.rm=TRUE)
      avg_score <- mean(team$Score, na.rm=TRUE)
      surplus <- sum(team$Surplus, na.rm=TRUE)
      avg_age <- mean(team$Age, na.rm=TRUE)
      data.frame(Owner=ow, Total_Score=total_score, Avg_Score=avg_score, Surplus=surplus, Avg_Age=avg_age, stringsAsFactors=FALSE)
    }) %>% bind_rows()

    if(nrow(pr_data)==0) return(NULL)

    # Normalize each component to 0-100
    norm <- function(x, invert=FALSE) {
      rng <- max(x, na.rm=TRUE) - min(x, na.rm=TRUE)
      if(rng == 0) return(rep(50, length(x)))
      n <- (x - min(x, na.rm=TRUE)) / rng * 100
      if(invert) n <- 100 - n
      n
    }

    pr_data$N_Total <- norm(pr_data$Total_Score)
    pr_data$N_Avg <- norm(pr_data$Avg_Score)
    pr_data$N_Surplus <- norm(pr_data$Surplus)
    pr_data$N_Youth <- norm(pr_data$Avg_Age, invert=TRUE)

    pr_data$Composite <- round(pr_data$N_Total * 0.40 + pr_data$N_Avg * 0.25 + pr_data$N_Surplus * 0.20 + pr_data$N_Youth * 0.15, 1)
    pr_data <- pr_data %>% arrange(desc(Composite))
    pr_data$Rank <- seq_len(nrow(pr_data))

    n_teams <- nrow(pr_data)

    rows_html <- paste0(sapply(seq_len(n_teams), function(i) {
      r <- pr_data[i, ]
      row_class <- if(i == 1) "pr-gold" else if(i == 2) "pr-silver" else if(i == 3) "pr-bronze" else if(i > n_teams - 3) "pr-bottom" else ""
      rank_color <- if(i == 1) "#ffd700" else if(i == 2) "#c0c0c0" else if(i == 3) "#cd7f32" else if(i > n_teams - 3) "#f85149" else "#8b949e"
      paste0(
        '<tr class="', row_class, '" style="border-bottom:1px solid #21262d;">',
        '<td style="padding:8px 12px;color:', rank_color, ';font-weight:700;font-size:1.1em;">#', r$Rank, '</td>',
        '<td style="padding:8px 12px;font-weight:600;color:#c9d1d9;">', htmltools::htmlEscape(r$Owner), '</td>',
        '<td style="padding:8px 12px;color:#f0883e;font-weight:700;">', r$Composite, '</td>',
        '<td style="padding:8px 12px;color:#8b949e;">', round(r$Total_Score, 0), '</td>',
        '<td style="padding:8px 12px;color:#8b949e;">', round(r$Avg_Score, 1), '</td>',
        '<td style="padding:8px 12px;color:', if(r$Surplus>0)"#3fb950"else"#f85149", ';">', ifelse(r$Surplus>0,"+",""), '$', format(round(r$Surplus), big.mark=",", scientific=FALSE), '</td>',
        '<td style="padding:8px 12px;color:#8b949e;">', round(r$Avg_Age, 1), '</td>',
        '</tr>')
    }), collapse="")

    HTML(paste0(
      '<div class="power-rank-card"><h4>Power Rankings</h4>',
      '<div style="color:#8b949e;font-size:.82em;margin-bottom:14px;">Composite: 40% total roster score, 25% avg score, 20% surplus value, 15% youth factor</div>',
      '<table style="width:100%;border-collapse:collapse;">',
      '<thead><tr style="border-bottom:2px solid #30363d;">',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Rank</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Owner</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Composite</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Total Score</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Avg Score</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Surplus</th>',
      '<th style="padding:8px 12px;text-align:left;color:#f0883e;font-size:.82em;text-transform:uppercase;">Avg Age</th>',
      '</tr></thead><tbody>',
      rows_html,
      '</tbody></table></div>'))
  })

  output$lo_stats <- renderUI({
    ac <- all_contracts(); fa_exp <- fa_2026() %>% filter(FA_Source=="Expiring"); if(nrow(ac)==0) return(NULL)
    total_sal <- sum(ac$Salary_Num,na.rm=TRUE); exp_sal <- sum(fa_exp$Salary_Num,na.rm=TRUE)
    total_proj <- sum(ac$Proj_Salary,na.rm=TRUE)
    league_surplus <- total_proj - total_sal
    div(class="stat-bar",
      div(class="stat-box",div(class="num",nrow(ac)),div(class="lbl","Total Contracts")),
      div(class="stat-box",div(class="num",style="color:#f85149",nrow(fa_exp)),div(class="lbl","Expiring")),
      div(class="stat-box",div(class="num",length(unique(ac$Status))),div(class="lbl","Teams")),
      div(class="stat-box",div(class="num",paste0("$",format(round(total_sal/1e6,1),nsmall=1),"M")),div(class="lbl","Total Salary")),
      div(class="stat-box",div(class="num",style="color:#a371f7",paste0("$",format(round(total_proj/1e6,1),nsmall=1),"M")),div(class="lbl","Total Proj Value")),
      div(class="stat-box",div(class="num",style=paste0("color:",if(league_surplus>0)"#3fb950"else"#f85149"),paste0("$",format(round(league_surplus/1e6,1),nsmall=1),"M")),div(class="lbl","League Surplus")))
  })

  output$lo_salary_table <- renderDT({
    ac <- all_contracts(); if(nrow(ac)==0) return(datatable(data.frame(),rownames=FALSE))
    summary <- ac %>% group_by(Owner=Status) %>%
      summarise(Players=n(),Total_Salary=sum(Salary_Num,na.rm=TRUE),Proj_Value=sum(Proj_Salary,na.rm=TRUE),
        Surplus=sum(Surplus,na.rm=TRUE),
        Forwards=sum(`Prim Pos`=="F",na.rm=TRUE),Defense=sum(`Prim Pos`=="D",na.rm=TRUE),
        Goalies=sum(PT=="Goalie",na.rm=TRUE),Avg_Score=round(mean(Score,na.rm=TRUE),1),Avg_Age=round(mean(Age,na.rm=TRUE),1),.groups="drop") %>%
      arrange(desc(Surplus))
    datatable(summary,rownames=FALSE,options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(3,'desc')))) %>%
      formatCurrency(c("Total_Salary","Proj_Value","Surplus"),currency="$",digits=0) %>%
      formatStyle('Surplus',color=styleInterval(0,c("#f85149","#3fb950")),fontWeight='bold') %>%
      formatStyle('Total_Salary',background=styleColorBar(range(summary$Total_Salary),'rgba(240,136,62,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$lo_expiring_table <- renderDT({
    fa <- fa_2026() %>% filter(FA_Source=="Expiring"); if(nrow(fa)==0) return(datatable(data.frame(Message="No expiring"),rownames=FALSE))
    exp_summary <- fa %>% group_by(Owner=Status) %>%
      summarise(Expiring=n(),RFAs=sum(FA_Type=="RFA"),UFAs=sum(FA_Type=="UFA"),
        Salary_Freed=sum(Salary_Num,na.rm=TRUE),Proj_Value_Lost=sum(Proj_Salary,na.rm=TRUE),
        Best_FA=Player[which.max(Score)],Best_Score=round(max(Score,na.rm=TRUE),1),.groups="drop") %>%
      arrange(desc(Expiring))
    datatable(exp_summary,rownames=FALSE,options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(1,'desc')))) %>%
      formatCurrency(c("Salary_Freed","Proj_Value_Lost"),currency="$",digits=0)
  })

  output$lo_tier_table <- renderDT({
    ac <- all_contracts(); if(nrow(ac)==0) return(datatable(data.frame(),rownames=FALSE))
    tier_summary <- ac %>% group_by(Tier) %>%
      summarise(Players=n(),Total_Salary=sum(Salary_Num,na.rm=TRUE),Avg_Score=round(mean(Score,na.rm=TRUE),1),
        Avg_Age=round(mean(Age,na.rm=TRUE),1),Top_Player=Player[which.max(Score)],Top_Score=round(max(Score,na.rm=TRUE),1),.groups="drop") %>%
      arrange(Total_Salary)
    datatable(tier_summary,rownames=FALSE,options=list(pageLength=6,scrollX=TRUE,dom='t')) %>%
      formatCurrency("Total_Salary",currency="$",digits=0)
  })
}

shinyApp(ui, server)
