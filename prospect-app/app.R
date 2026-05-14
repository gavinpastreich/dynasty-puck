library(shiny)
library(DT)
library(dplyr)
library(readr)
library(stringr)
# httr/jsonlite only available natively, not in webR/shinylive
if(identical(R.version$os, "emscripten")) {
  has_httr <- FALSE
  has_jsonlite <- FALSE
} else {
  has_httr <- requireNamespace("httr", quietly=TRUE)
  has_jsonlite <- requireNamespace("jsonlite", quietly=TRUE)
  if(has_httr) library(httr)
  if(has_jsonlite) library(jsonlite)
}

# ── Prospect Valuation Model ──
# Dynasty value tiers based on score, age, position, GP
# Fantasy impact timeline projections
# MNR graduation timeline projections
# Fantasy readiness scoring
# ELC bargain projections

dynasty_value <- function(score, age, pos, gp, contract) {
  # For MNR prospects with NHL GP and score, project their dynasty ceiling
  if(is.na(score) || score == 0) {
    # No NHL stats yet - value based purely on age and position
    if(is.na(age)) return(list(tier="Unknown", score=0))
    age_val <- case_when(age<=18~55, age<=19~45, age<=20~35, age<=21~25, age<=22~15, TRUE~8)
    return(list(tier=case_when(age_val>=50~"High Upside",age_val>=30~"Developing",age_val>=15~"Depth Prospect",TRUE~"Longshot"), score=age_val))
  }
  # Base value from fantasy score
  base <- score
  # Age multiplier: younger prospects with same score = more valuable
  age_mult <- case_when(
    is.na(age) ~ 1.0,
    age <= 19 ~ 1.35,  # teenage NHLer = massive premium
    age <= 20 ~ 1.25,
    age <= 21 ~ 1.15,
    age <= 22 ~ 1.05,
    age <= 23 ~ 1.0,
    age <= 24 ~ 0.90,
    age <= 25 ~ 0.80,
    TRUE ~ 0.65
  )
  # GP context: more GP = more reliable signal
  gp_mult <- case_when(
    is.na(gp) || gp==0 ~ 0.5,
    gp < 20 ~ 0.75,
    gp < 40 ~ 0.85,
    gp < 60 ~ 0.95,
    TRUE ~ 1.0
  )
  dynasty_score <- round(base * age_mult * gp_mult, 1)
  tier <- case_when(
    dynasty_score >= 80 ~ "Franchise",
    dynasty_score >= 60 ~ "Star",
    dynasty_score >= 45 ~ "Top Line",
    dynasty_score >= 30 ~ "Middle Six",
    dynasty_score >= 18 ~ "Bottom Six",
    dynasty_score >= 8 ~ "Depth",
    TRUE ~ "Longshot"
  )
  list(tier=tier, score=dynasty_score)
}

# Feature 4: Fantasy Impact Timeline (replaces project_nhl_debut)
fantasy_impact_timeline <- function(score, age, gp, pos, readiness) {
  # Already contributing meaningfully
  if(!is.na(score) && score >= 50 && !is.na(gp) && gp >= 40) return("Impact Now")
  if(!is.na(score) && score >= 40 && !is.na(gp) && gp >= 20) return("This Season")
  # Has NHL time but limited
  if(!is.na(gp) && gp > 0) {
    if(!is.na(score) && score >= 30) return("2026-27")
    if(!is.na(age) && age <= 22) return("2027-28")
    return("2028+")
  }
  # No NHL time yet
  if(is.na(age)) return("Unknown")
  if(age <= 19) return("2028-29")
  if(age <= 21) return("2027-28")
  if(age <= 23) return("2028+")
  return("Unlikely")
}

# Feature 2: Fantasy Readiness Score (0-100)
fantasy_readiness <- function(score, age, gp) {
  s <- if(is.na(score)) 0 else score
  g <- if(is.na(gp)) 0 else gp
  a <- if(is.na(age)) 22 else age

  # Base: Score weight (0-40 pts)
  score_pts <- min(40, s / 100 * 40)

  # GP reliability (0-25 pts)
  gp_pts <- min(25, g / 82 * 25)

  # Age factor (0-20 pts)
  if(s > 0) {
    age_pts <- case_when(
      a <= 20 ~ 20,
      a <= 22 ~ 15,
      a <= 24 ~ 10,
      TRUE ~ 5
    )
  } else {
    # No score: younger = more upside
    age_pts <- case_when(
      a <= 18 ~ 20,
      a <= 19 ~ 17,
      a <= 20 ~ 14,
      a <= 21 ~ 10,
      a <= 22 ~ 6,
      TRUE ~ 2
    )
  }

  # Production rate (0-15 pts)
  rate_pts <- 0
  if(g > 10 && s > 0) {
    score_per_gp <- s / g
    # League average prospect ~0.5 score/gp; normalize to 15
    rate_pts <- min(15, score_per_gp / 1.0 * 15)
  }

  total <- round(score_pts + gp_pts + age_pts + rate_pts, 1)
  min(100, max(0, total))
}

readiness_tier <- function(readiness) {
  case_when(
    readiness >= 75 ~ "NHL Ready",
    readiness >= 50 ~ "Near Ready",
    readiness >= 30 ~ "Developing",
    readiness >= 15 ~ "Raw",
    TRUE ~ "Long-term Stash"
  )
}

readiness_color <- function(readiness) {
  case_when(
    readiness >= 75 ~ "#3fb950",
    readiness >= 50 ~ "#58a6ff",
    readiness >= 30 ~ "#f0883e",
    readiness >= 15 ~ "#8b949e",
    TRUE ~ "#484f58"
  )
}

# Feature 5: Salary projection for ELC value
project_salary <- function(score, age, pos) {
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
  age_mult <- case_when(
    is.na(age) ~ 1.0, age <= 21 ~ 1.20, age <= 23 ~ 1.12,
    age <= 28 ~ 1.0, age <= 30 ~ 0.90, age <= 32 ~ 0.78,
    age <= 34 ~ 0.65, age <= 36 ~ 0.50, TRUE ~ 0.35
  )
  pmin(17500000, pmax(1000000, round(base * age_mult, -4)))
}

elc_value_projection <- function(score, age, gp, readiness) {
  ELC_SALARY <- 1500000
  if(is.na(score) || score == 0) return(list(projected_worth=NA, surplus=NA, label="N/A"))
  projected_worth <- project_salary(score, age, "F")
  surplus <- projected_worth - ELC_SALARY
  label <- case_when(
    surplus >= 8000000 ~ "Elite Bargain",
    surplus >= 4000000 ~ "Great Value",
    surplus >= 2000000 ~ "Good Value",
    surplus >= 500000 ~ "Fair Value",
    TRUE ~ "Minimal Surplus"
  )
  list(projected_worth=projected_worth, surplus=surplus, label=label)
}

# Project when MNR threshold will be crossed (82 GP skater / 41 GP goalie)
project_graduation <- function(career_gp, season_gp, pos, age) {
  threshold <- if(pos=="G") 41L else 82L
  if(is.na(career_gp) || career_gp==0) {
    if(is.na(season_gp) || season_gp==0) return("No NHL GP")
    career_gp <- season_gp  # use season as proxy
  }
  if(career_gp >= threshold) return("GRADUATED")
  remaining <- threshold - career_gp
  # Estimate GP per season based on current pace
  gp_per_season <- if(!is.na(season_gp) && season_gp > 10) season_gp else 50
  seasons_left <- remaining / gp_per_season
  if(seasons_left <= 0.3) return("This season")
  if(seasons_left <= 1) return("2026-27")
  if(seasons_left <= 2) return("2027-28")
  if(seasons_left <= 3) return("2028-29")
  return("2029+")
}

# Draft prospect valuation for 2026 draft picks
draft_dynasty_value <- function(rank, nhle, pos, league) {
  # NHL make-it probability based on draft position
  make_pct <- case_when(
    rank <= 3 ~ 95, rank <= 5 ~ 92, rank <= 10 ~ 85,
    rank <= 15 ~ 75, rank <= 20 ~ 70, rank <= 31 ~ 62,
    rank <= 45 ~ 45, rank <= 64 ~ 35, rank <= 90 ~ 22, TRUE ~ 12
  )
  # Ceiling tier based on NHLe + draft position
  ceiling <- case_when(
    nhle >= 35 & rank <= 10 ~ "Franchise",
    nhle >= 30 & rank <= 15 ~ "Star",
    nhle >= 25 & rank <= 25 ~ "Top Line",
    nhle >= 20 ~ "Middle Six",
    nhle >= 12 ~ "Bottom Six",
    nhle >= 5 ~ "Depth",
    TRUE ~ "Longshot"
  )
  # Estimated time to NHL debut by league
  years_to_nhl <- case_when(
    grepl("OHL|WHL|QMJHL", league) ~ 2.0,
    grepl("SHL", league) ~ 2.5,
    grepl("Liiga", league) ~ 3.0,
    grepl("NCAA", league) ~ 3.0,
    grepl("KHL", league) ~ 3.5,
    grepl("J20|MHL|Allsvenskan", league) ~ 3.5,
    TRUE ~ 3.0
  )
  debut_year <- 2026 + round(years_to_nhl)
  debut_est <- paste0(debut_year, "-", substr(debut_year+1, 3, 4))
  # Dynasty score: weighted combo of rank, NHLe, and probability
  dyn_score <- round((make_pct * 0.4) + (nhle * 1.2) + (max(0, 115 - rank) * 0.15), 1)
  list(ceiling=ceiling, make_pct=make_pct, debut_est=debut_est, dynasty_score=dyn_score, years_to_nhl=years_to_nhl)
}

ui <- fluidPage(
  tags$head(tags$style(HTML("
    body{background:#0e1117;color:#c9d1d9;font-family:'Segoe UI',sans-serif;overflow-x:hidden}
    .container-fluid{max-width:1500px}

    .app-header{background:linear-gradient(135deg,#1a1f2e 0%,#1a1530 50%,#0d2137 100%);border-bottom:3px solid #a371f7;padding:22px 28px;margin-bottom:22px;border-radius:0 0 12px 12px;position:relative;overflow:hidden}
    .app-header::after{content:'';position:absolute;top:0;left:-50%;width:200%;height:100%;background:linear-gradient(90deg,transparent,rgba(163,113,247,.04),transparent);animation:headerShimmer 8s ease infinite}
    @keyframes headerShimmer{0%,100%{transform:translateX(-30%)}50%{transform:translateX(30%)}}
    .app-header h2{color:#a371f7;margin:0 0 4px 0;font-size:1.7em;font-weight:700;letter-spacing:-.02em}
    .app-header p{color:#8b949e;margin:0;font-size:.9em}

    .nav-tabs{border-bottom:2px solid #21262d}.nav-tabs>li>a{color:#8b949e;background:transparent;border:none;transition:all .2s ease;padding:10px 18px}
    .nav-tabs>li.active>a,.nav-tabs>li.active>a:hover,.nav-tabs>li.active>a:focus{color:#a371f7;background:#161b22;border:none;border-bottom:3px solid #a371f7}
    .nav-tabs>li>a:hover{color:#c9d1d9;background:#161b22;border:none;transform:translateY(-1px)}

    .well{background:#161b22;border:1px solid #21262d;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    .form-control,select{background:#0d1117!important;color:#c9d1d9!important;border:1px solid #30363d!important;border-radius:6px!important;transition:border-color .2s}
    .form-control:focus,select:focus{border-color:#a371f7!important;box-shadow:0 0 0 3px rgba(163,113,247,.15)!important}
    label{color:#8b949e;font-size:.85em;text-transform:uppercase;letter-spacing:.03em}
    .btn-default{background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;transition:all .2s}
    .btn-default:hover{background:#30363d;color:#a371f7;border-color:#a371f7;transform:translateY(-1px);box-shadow:0 3px 8px rgba(163,113,247,.15)}

    table.dataTable{color:#c9d1d9!important;border-collapse:separate;border-spacing:0}
    table.dataTable thead th{background:#161b22!important;color:#a371f7!important;border-bottom:2px solid #30363d!important;font-size:.85em;text-transform:uppercase;letter-spacing:.03em}
    table.dataTable tbody tr{background:#0d1117!important;transition:all .15s ease}
    table.dataTable tbody tr:hover{background:#161b22!important;box-shadow:inset 3px 0 0 #a371f7}
    table.dataTable tbody tr.selected{background:#1c3a5c!important;box-shadow:inset 3px 0 0 #58a6ff}
    table.dataTable tbody td{border-color:#21262d!important;padding:10px 12px!important}
    .dataTables_wrapper .dataTables_filter input,.dataTables_wrapper .dataTables_length select{background:#0d1117!important;color:#c9d1d9!important;border:1px solid #30363d!important;border-radius:6px!important}
    .dataTables_wrapper .dataTables_info,.dataTables_wrapper .dataTables_length label,.dataTables_wrapper .dataTables_filter label{color:#8b949e!important}
    .dataTables_wrapper .dataTables_paginate .paginate_button{color:#8b949e!important;border-radius:4px!important;transition:all .15s}
    .dataTables_wrapper .dataTables_paginate .paginate_button.current{color:#a371f7!important;background:#161b22!important;border:1px solid #a371f7!important}
    .dataTables_wrapper .dataTables_paginate .paginate_button:hover{color:#a371f7!important;background:#21262d!important}

    .player-card{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    @keyframes cardSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .player-card h3{color:#a371f7;margin-top:0;font-size:1.3em;font-weight:700}.player-card .meta{color:#8b949e;margin-bottom:14px;font-size:.9em}
    .link-btn{display:inline-block;margin:4px 6px 4px 0;padding:7px 16px;background:#21262d;color:#58a6ff;border-radius:8px;font-size:.85em;border:1px solid #30363d;cursor:pointer;transition:all .2s ease;user-select:none}
    .link-btn:hover{background:#30363d;color:#79c0ff;transform:translateY(-2px);box-shadow:0 4px 12px rgba(88,166,255,.15);border-color:#58a6ff}
    .link-btn:active{transform:translateY(0)}
    .link-section{margin-bottom:10px}.link-section h4{color:#8b949e;font-size:.8em;margin:12px 0 6px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}

    .browser-bar{background:#161b22;border:1px solid #30363d;border-radius:10px 10px 0 0;padding:10px 16px;display:flex;align-items:center;gap:10px;margin-top:14px}
    .browser-bar .dots{display:flex;gap:6px}.browser-bar .dot{width:10px;height:10px;border-radius:50%}.dot-r{background:#f85149}.dot-y{background:#f0883e}.dot-g{background:#3fb950}
    .browser-bar .url-display{flex:1;background:#0d1117;color:#8b949e;border:1px solid #30363d;border-radius:6px;padding:6px 12px;font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Consolas','Courier New',monospace}
    .browser-frame{border:1px solid #30363d;border-top:none;border-radius:0 0 10px 10px;width:100%;height:550px;background:white}
    .browser-placeholder{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:10px;padding:40px;text-align:center;color:#484f58;margin-top:14px;font-size:.95em}
    .browser-placeholder .icon{font-size:2em;margin-bottom:8px;opacity:.5}

    .badge-prospect{background:linear-gradient(135deg,#a371f7,#8957e5);color:#fff;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em}
    .badge-mnr{background:linear-gradient(135deg,#3fb950,#2ea043);color:#0d1117;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em}
    .badge-graduating{background:linear-gradient(135deg,#f0883e,#d97218);color:#0d1117;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em}
    .badge-elc{background:linear-gradient(135deg,#58a6ff,#388bfd);color:#0d1117;padding:3px 10px;border-radius:6px;font-weight:bold;font-size:.78em}

    .pool-card{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    .pool-card h4{color:#a371f7;margin-top:0;font-weight:700}
    .pool-player{padding:6px 0;border-bottom:1px solid #21262d;font-size:.9em;transition:background .15s}
    .pool-player:hover{background:rgba(163,113,247,.05);padding-left:6px}

    .stat-bar{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap}
    .stat-box{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:10px 16px;flex:1;min-width:120px;text-align:center}
    .stat-box .num{color:#a371f7;font-size:1.6em;font-weight:700;line-height:1.2}.stat-box .lbl{color:#8b949e;font-size:.75em;text-transform:uppercase;letter-spacing:.05em}

    .rank-badge{display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;font-weight:700;font-size:.9em;margin-right:8px}
    .rank-1{background:linear-gradient(135deg,#f0883e,#d97218);color:#0d1117}
    .rank-2{background:linear-gradient(135deg,#8b949e,#6e7681);color:#0d1117}
    .rank-3{background:linear-gradient(135deg,#cd7f32,#a0622e);color:#0d1117}
    .rank-other{background:#21262d;color:#8b949e}

    .threshold-bar{height:8px;border-radius:4px;background:#21262d;position:relative;margin:4px 0}
    .threshold-fill{height:100%;border-radius:4px;transition:width .3s}
    .threshold-safe{background:#3fb950}.threshold-watch{background:#f0883e}.threshold-graduated{background:#f85149}

    .upload-zone{background:#161b22;border:2px dashed #30363d;border-radius:10px;padding:16px;margin-bottom:14px;text-align:center}
    .upload-zone:hover{border-color:#a371f7}
    .upload-zone label{color:#a371f7!important;font-size:.9em!important;text-transform:none!important;letter-spacing:normal!important}

    .irs--shiny .irs-bar{background:linear-gradient(90deg,#a371f7,#8957e5)}.irs--shiny .irs-handle{border:2px solid #a371f7;background:#161b22}
    .irs--shiny .irs-from,.irs--shiny .irs-to,.irs--shiny .irs-single{background:#a371f7;border-radius:4px}
    .shiny-busy .app-header::after{animation:headerShimmer 1s ease infinite!important}

    .dv-franchise{color:#ffd700;font-weight:700}.dv-star{color:#f0883e;font-weight:700}.dv-topline{color:#3fb950;font-weight:600}
    .dv-middlesix{color:#58a6ff}.dv-bottomsix{color:#8b949e}.dv-depth{color:#6e7681}.dv-longshot{color:#484f58}
    .dv-highupside{color:#a371f7;font-weight:600}.dv-developing{color:#58a6ff}.dv-unknown{color:#484f58}
    .dv-depthprospect{color:#6e7681}

    .val-card{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;margin:10px 0}
    .val-card .val-label{color:#8b949e;font-size:.78em;text-transform:uppercase;letter-spacing:.03em}
    .val-card .val-value{font-size:1.1em;font-weight:700;margin-top:2px}

    .timeline-bar{display:flex;align-items:center;gap:8px;padding:8px 0}
    .timeline-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
    .timeline-line{height:2px;flex:1;background:#21262d}
    .timeline-label{font-size:.78em;color:#8b949e;white-space:nowrap}
    .tl-past{background:#3fb950}.tl-current{background:#f0883e;box-shadow:0 0 8px rgba(240,136,62,.5)}.tl-future{background:#30363d}

    .rec-section{margin-top:14px;padding:14px;background:#0d1117;border:1px solid #21262d;border-radius:10px}
    .rec-section h5{color:#58a6ff;margin:0 0 10px;font-size:.92em;font-weight:600}

    .version-badge{display:inline-block;background:linear-gradient(135deg,#a371f7,#8957e5);color:#fff;padding:2px 8px;border-radius:6px;font-size:.7em;font-weight:700;margin-left:10px;vertical-align:middle}

    .app-footer{background:#161b22;border-top:2px solid #21262d;padding:14px 28px;margin-top:30px;border-radius:12px 12px 0 0;text-align:center;color:#484f58;font-size:.82em}

    .sleeper-panel{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:18px;margin-bottom:18px;animation:cardSlideIn .3s ease}
    .sleeper-panel h4{color:#f0883e;margin:0 0 12px;font-weight:700;font-size:1em}
    .sleeper-card{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 14px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;transition:all .15s}
    .sleeper-card:hover{border-color:#a371f7;background:#161b22}
    .sleeper-card .sleeper-name{font-weight:600;color:#c9d1d9;font-size:.9em}
    .sleeper-card .sleeper-meta{color:#8b949e;font-size:.78em}
    .sleeper-card .sleeper-score{color:#a371f7;font-weight:700;font-size:1em}

    .compare-card{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease}
    .compare-card h4{color:#a371f7;margin:0 0 14px;font-weight:700}
    .compare-row{display:flex;gap:0;margin:4px 0;font-size:.88em}
    .compare-label{flex:0 0 130px;color:#8b949e;padding:6px 10px;text-transform:uppercase;font-size:.78em;letter-spacing:.03em;display:flex;align-items:center}
    .compare-val{flex:1;padding:6px 12px;border-radius:4px;text-align:center;font-weight:600}
    .compare-win{background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.25)}
    .compare-lose{background:rgba(248,81,73,.06);color:#8b949e;border:1px solid #21262d}
    .compare-tie{background:rgba(163,113,247,.08);color:#a371f7;border:1px solid rgba(163,113,247,.2)}

    .trade-section{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:18px}
    .trade-section h4{color:#58a6ff;margin:0 0 14px;font-weight:700}
    .trade-side{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:14px;flex:1;min-width:200px}
    .trade-side h5{color:#a371f7;margin:0 0 8px;font-weight:700;font-size:.92em}
    .trade-player-item{padding:4px 0;border-bottom:1px solid #1a1f2e;font-size:.85em;color:#c9d1d9}
    .trade-total{margin-top:8px;padding-top:8px;border-top:2px solid #30363d;font-size:1.1em;font-weight:700}
    .trade-verdict{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:14px;margin-top:12px;text-align:center;font-size:1em}
    .trade-fair{color:#3fb950;border-color:#3fb950}.trade-unfair{color:#f0883e;border-color:#f0883e}

    .draft-value-pick{background:rgba(63,185,80,.08)!important;box-shadow:inset 3px 0 0 #3fb950!important}
    .value-badge{display:inline-block;background:linear-gradient(135deg,#3fb950,#2ea043);color:#0d1117;padding:2px 8px;border-radius:6px;font-weight:700;font-size:.72em;margin-left:6px}

    .empty-state{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:50px 30px;text-align:center;margin-top:14px}
    .empty-state .empty-icon{font-size:2.5em;margin-bottom:12px;opacity:.4}
    .empty-state .empty-title{color:#c9d1d9;font-size:1.1em;font-weight:600;margin-bottom:6px}
    .empty-state .empty-desc{color:#484f58;font-size:.88em}

    .btn-reset{background:#21262d;color:#f85149;border:1px solid #f85149;border-radius:6px;transition:all .2s;margin-top:10px}
    .btn-reset:hover{background:#3d1418;color:#f85149;border-color:#f85149;transform:translateY(-1px)}

    .pipeline-card{background:linear-gradient(135deg,#161b22,#1a1530);border:1px solid #30363d;border-radius:12px;padding:22px;margin-top:14px;animation:cardSlideIn .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.3)}
    .pipeline-card h4{color:#a371f7;margin-top:0;font-weight:700}
    .pipeline-expiring{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;margin:6px 0}
    .pipeline-expiring .exp-name{font-weight:600;color:#c9d1d9;font-size:.9em}
    .pipeline-expiring .exp-meta{color:#8b949e;font-size:.78em;margin-top:2px}
    .pipeline-replacement{padding:6px 10px;margin:4px 0;border-radius:6px;font-size:.85em}
    .pipeline-ready{background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.25);color:#3fb950}
    .pipeline-developing{background:rgba(240,136,62,.1);border:1px solid rgba(240,136,62,.25);color:#f0883e}
    .pipeline-none{background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.2);color:#f85149}
    .pipeline-gap{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);border-radius:8px;padding:12px;margin:6px 0}
    .pipeline-gap .gap-pos{color:#f85149;font-weight:700;font-size:.9em}
    .pipeline-gap .gap-desc{color:#8b949e;font-size:.8em;margin-top:2px}

    .readiness-nhlready{color:#3fb950;font-weight:700}
    .readiness-nearready{color:#58a6ff;font-weight:600}
    .readiness-developing{color:#f0883e}
    .readiness-raw{color:#8b949e}
    .readiness-long-termstash{color:#484f58}

    .elc-surplus{color:#3fb950;font-weight:700}
    .elc-value-card{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:10px 14px;margin:8px 0}

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
      .browser-frame{height:350px}
      .compare-card{padding:14px}
      .compare-label{flex:0 0 90px;font-size:.72em}
      .pipeline-card{padding:14px}
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
      .sleeper-card{flex-direction:column;align-items:flex-start;gap:4px}
      .trade-side{min-width:unset}
      .compare-row{flex-direction:column;gap:2px}
      .compare-label{flex:unset;padding:4px 10px}
      .compare-val{text-align:left;padding:4px 10px}
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
    tags$meta(name="apple-mobile-web-app-title", content="Dynasty Puck Prospects"),
    tags$meta(name="theme-color", content="#0e1117"),
    tags$link(rel="manifest", href="manifest.json")
  )),

  div(class="app-header",
    h2(HTML("\U0001F31F Dynasty Puck \u2022 Prospect Pool <span class='version-badge'>v3.1</span>")),
    p("MNR prospects & 2026 Draft \u2022 Dynasty valuations & fantasy readiness \u2022 Pipeline analysis \u2022 ELC projections \u2022 Career GP from Hockey Reference")),

  tabsetPanel(id="mainTabs",
    tabPanel("\U0001F31F Prospect Roster",fluidRow(
      column(3,wellPanel(h4("Filters",style="color:#a371f7;margin-top:0;font-weight:700;"),
        p(HTML("<b>MNR</b> = minor-league affiliated prospect<br><br>
          <b>MNR Graduation Threshold:</b><br>
          Skaters: <b>82 career NHL GP</b><br>
          Goalies: <b>41 career NHL GP</b><br>
          Career games are cumulative across all NHL seasons, not just this year. Players who hit the threshold must sign an ELC or be released. Players below the threshold by end of regular season can be rostered at $0.<br><br>
          <b>Dynasty Value</b> projects long-term ceiling based on score, age & production rate.<br><br>
          <b>Readiness</b> = how close to fantasy impact (0-100).<br>
          <b>Score/GP</b> = fantasy points per game."),style="color:#8b949e;font-size:.8em;margin-bottom:14px;"),
        selectInput("pr_pos","Position",c("All","F","D","G")),sliderInput("pr_age","Age",16,30,c(16,25)),
        selectInput("pr_status","Owner",c("All")),selectInput("pr_team","Affiliate",c("All")),
        selectInput("pr_dynasty","Dynasty Tier",c("All","Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","High Upside","Developing","Longshot")),
        checkboxInput("pr_has_gp","Has NHL GP",FALSE),
        actionButton("pr_reset_filters","Reset Filters",class="btn-reset",width="100%"),
        hr(style="border-color:#21262d;"),
        div(class="upload-zone",
          fileInput("upload_skaters","Upload Skaters CSV",accept=".csv"),
          fileInput("upload_goalies","Upload Goalies CSV",accept=".csv")),
        actionButton("fetch_career_gp","Fetch Career GP from Hockey Reference",class="btn-default",width="100%",style="margin-top:8px;"),
        p("Scrapes Hockey Reference for career NHL GP for all MNR prospects to track graduation thresholds.",style="color:#484f58;font-size:.75em;margin-top:6px;"),
        hr(style="border-color:#21262d;"),
        h4("Compare Prospects",style="color:#58a6ff;margin-top:0;font-weight:700;font-size:.95em;"),
        selectInput("compare_a","Player A",c("(select)"="")),
        selectInput("compare_b","Player B",c("(select)"=""))
      )),
      column(9,
        uiOutput("pr_stats"),
        DTOutput("pr_table"),
        uiOutput("pr_compare_card"),
        uiOutput("pr_card"),uiOutput("pr_browser")))),

    tabPanel("\U0001F3C6 Pool Rankings",fluidRow(
      column(3,wellPanel(h4("Pool Rankings",style="color:#a371f7;margin-top:0;font-weight:700;"),
        p(HTML("Ranked by <b>weighted potential</b>:<br><br>
          <span style='color:#f0883e'><b>35%</b></span> \u2014 #1 prospect score<br>
          <span style='color:#f0883e'><b>18%</b></span> \u2014 #2 prospect score<br>
          <span style='color:#f0883e'><b>10%</b></span> \u2014 #3 prospect score<br>
          <span style='color:#58a6ff'><b>12%</b></span> \u2014 Depth (4th\u20138th avg)<br>
          <span style='color:#3fb950'><b>10%</b></span> \u2014 NHL-ready count<br>
          <span style='color:#a371f7'><b>8%</b></span> \u2014 Youth factor<br>
          <span style='color:#8b949e'><b>7%</b></span> \u2014 Pool size<br><br>
          <span style='color:#f85149'>\u26A0 Graduation risk</span> penalizes pools near MNR threshold.<br><br>
          <b>MNR Graduation</b> is based on <b>career NHL GP</b> (all seasons combined), not just this season:<br>
          Skaters: 82 career GP<br>
          Goalies: 41 career GP<br>
          Graduated prospects must sign an ELC. Non-graduated MNR players can be kept at $0 next season."),
          style="color:#8b949e;font-size:.82em;margin-bottom:14px;"),
        selectInput("pool_owner","Focus on Owner",c("All")))),
      column(9,DTOutput("pool_table"),uiOutput("pool_detail")))),

    # Feature 1: Pipeline tab (between Pool Rankings and Trade Value Board)
    tabPanel("\U0001F504 Pipeline",fluidRow(
      column(3,wellPanel(h4("Prospect Pipeline",style="color:#a371f7;margin-top:0;font-weight:700;"),
        p(HTML("Connects your <b>MNR prospect pool</b> to actual roster needs.<br><br>
          Shows expiring BID contracts ($1M-$2.49M, 1-year deals) and which prospects could replace them.<br><br>
          <span style='color:#3fb950'>Green</span> = prospect ready to step in<br>
          <span style='color:#f0883e'>Orange</span> = needs 1-2 more years<br>
          <span style='color:#f85149'>Red</span> = no viable replacement"),
          style="color:#8b949e;font-size:.8em;margin-bottom:14px;"),
        selectInput("pipe_owner","Select Owner",c("All")))),
      column(9,
        uiOutput("pipe_summary"),
        uiOutput("pipe_detail")))),

    tabPanel("\U0001F4B9 Trade Value Board",fluidRow(
      column(3,wellPanel(h4("Trade Value Board",style="color:#a371f7;margin-top:0;font-weight:700;"),
        p(HTML("All prospects ranked by <b>Dynasty Score</b> globally. Use this to evaluate prospect-for-prospect trades.<br><br>
          Select players for each side of a trade to compare total dynasty value."),style="color:#8b949e;font-size:.8em;margin-bottom:14px;"),
        selectInput("tv_pos","Position",c("All","F","D","G")),
        selectInput("tv_tier","Dynasty Tier",c("All","Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","High Upside","Developing","Longshot")),
        selectInput("tv_owner","Owner",c("All")),
        hr(style="border-color:#21262d;"),
        h4("Compare Trade",style="color:#58a6ff;margin-top:0;font-weight:700;font-size:.95em;"),
        selectInput("tv_side_a","Side A Players",c(),multiple=TRUE),
        selectInput("tv_side_b","Side B Players",c(),multiple=TRUE),
        actionButton("tv_evaluate","Evaluate Trade",class="btn-default",width="100%",style="margin-top:6px;")
      )),
      column(9,
        uiOutput("tv_stats"),
        DTOutput("tv_table"),
        uiOutput("tv_trade_result")))),

    tabPanel("\U0001F4DD 2026 Draft",fluidRow(
      column(3,wellPanel(h4("2026 NHL Draft",style="color:#a371f7;margin-top:0;font-weight:700;"),
        p("June 27\u201328 \u2022 Buffalo, NY",style="color:#8b949e;font-size:.85em;margin-bottom:4px;"),
        p(HTML("114 prospects with <b>dynasty valuations</b>, NHL make-it probability, projected debut timeline & ceiling projections.<br><br>
          <span class='dv-franchise'>Franchise</span> = generational talent<br>
          <span class='dv-star'>Star</span> = perennial all-star upside<br>
          <span class='dv-topline'>Top Line</span> = 1st line / top pair<br>
          <span class='dv-middlesix'>Middle Six</span> = solid contributor<br>
          <span class='dv-bottomsix'>Bottom Six</span> = depth role player<br><br>
          <span style='color:#3fb950;font-weight:700'>VALUE PICK</span> = Dynasty Score exceeds expected value for draft position"),
          style="color:#8b949e;font-size:.8em;margin-bottom:14px;"),
        selectInput("dr_pos","Position",c("All","Forward","Defense","Goalie")),
        selectInput("dr_tier","Fantasy Tier",c("All")),selectInput("dr_league","League",c("All")),selectInput("dr_nat","Nationality",c("All")),
        selectInput("dr_ceiling","Ceiling",c("All","Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","Longshot")),
        selectInput("dr_style","Player Style",c("All","Elite Playmaker","Playmaker","Sniper","Power Forward","Skilled Winger","Two-Way C","Two-Way F","Offensive D","Two-Way D","Defensive D","Starting G Upside","Backup G")),
        hr(style="border-color:#21262d;"),
        div(class="upload-zone",fileInput("upload_draft","Upload Draft CSV",accept=".csv")))),
      column(9,
        uiOutput("dr_stats"),
        DTOutput("dr_table"),uiOutput("dr_card"),uiOutput("dr_browser"))))
  ),

  div(class="app-footer",
    HTML("Dynasty Puck Prospects v3.1 &bull; MNR tracking &bull; Career GP from Hockey Reference &bull; Pipeline analysis &bull; Fantasy readiness &bull; ELC projections &bull; Draft scouting"))
)

server <- function(input, output, session) {
  browser_url <- reactiveValues(pr=NULL,dr=NULL)
  # Load saved career GP data if available
  saved_cgp <- tryCatch(read.csv("mnr_career_gp.csv", stringsAsFactors=FALSE), error=function(e) NULL)
  career_gp_cache <- reactiveValues(
    data = if(!is.null(saved_cgp) && nrow(saved_cgp) > 0) saved_cgp else NULL,
    status = if(!is.null(saved_cgp) && nrow(saved_cgp) > 0) "fetched" else "not_fetched"
  )

  safe_salary <- function(x) { if (is.numeric(x)) return(x); as.numeric(gsub("[^0-9.]","",as.character(x))) }

  fetch_career_gp_href <- function(player_name) {
    if(!has_httr) return(NA_integer_)
    tryCatch({
      # Search hockey-reference for the player
      search_url <- paste0("https://www.hockey-reference.com/search/search.fcgi?search=", URLencode(player_name))
      res <- GET(search_url, timeout(10), add_headers(`User-Agent` = "Mozilla/5.0"))
      if(status_code(res) != 200) return(NA_integer_)
      html <- content(res, "text", encoding = "UTF-8")

      # Check if we landed directly on a player page (redirect)
      final_url <- res$url
      if(grepl("/players/", final_url)) {
        # Landed on player page directly - parse career GP from stats
        gp <- parse_href_career_gp(html)
        return(gp)
      }

      # Otherwise we're on search results - find the best player link
      # Look for links to player pages in search results
      player_links <- regmatches(html, gregexpr('/players/[a-z]/[a-z]+[0-9]+\\.html', html))[[1]]
      if(length(player_links) == 0) return(NA_integer_)

      # Fetch the first player page
      player_url <- paste0("https://www.hockey-reference.com", player_links[1])
      res2 <- GET(player_url, timeout(10), add_headers(`User-Agent` = "Mozilla/5.0"))
      if(status_code(res2) != 200) return(NA_integer_)
      html2 <- content(res2, "text", encoding = "UTF-8")
      gp <- parse_href_career_gp(html2)
      return(gp)
    }, error = function(e) NA_integer_)
  }

  parse_href_career_gp <- function(html) {
    # Look for the career totals row in the stats table
    # hockey-reference has a footer row with id="stats_basic_plus_nhl.career" or similar
    # The GP is typically the first numeric stat column in the career total row
    # Pattern: look for career total row and extract GP
    career_pattern <- '<tfoot>.*?<tr[^>]*>.*?<th[^>]*>Career</th>(.*?)</tr>'
    career_match <- regmatches(html, regexpr(career_pattern, html, perl = TRUE))
    if(length(career_match) == 0 || nchar(career_match) == 0) {
      # Try alternate: look for "Career" in tfoot with data-stat="games_played"
      gp_pattern <- 'data-stat="games_played"[^>]*>([0-9]+)<'
      # Find all career GP values - the tfoot career row
      tfoot_match <- regmatches(html, regexpr('<tfoot>.*?</tfoot>', html, perl = TRUE))
      if(length(tfoot_match) > 0 && nchar(tfoot_match) > 0) {
        gp_matches <- regmatches(tfoot_match, gregexpr(gp_pattern, tfoot_match, perl = TRUE))[[1]]
        if(length(gp_matches) > 0) {
          gp_val <- regmatches(gp_matches[1], regexpr('[0-9]+', gp_matches[1]))
          return(as.integer(gp_val))
        }
      }
      return(NA_integer_)
    }
    # Extract GP from career row using data-stat
    gp_pattern2 <- 'data-stat="games_played"[^>]*>([0-9]+)<'
    gp_match <- regmatches(career_match, regexpr(gp_pattern2, career_match, perl = TRUE))
    if(length(gp_match) > 0 && nchar(gp_match) > 0) {
      gp_val <- regmatches(gp_match, regexpr('[0-9]+', gp_match))
      return(as.integer(gp_val))
    }
    NA_integer_
  }

  skaters_raw <- reactive({
    uploaded <- input$upload_skaters
    path <- if(!is.null(uploaded)) uploaded$datapath else "Fantrax-Players-Dynasty_Puck__78_.csv"
    tryCatch(read_csv(path,show_col_types=FALSE) %>%
      mutate(Salary_Num=safe_salary(Salary),across(c(Score,GP,Age,G,A,`2G+A`,PIM,SOG,STP,Hit,Blk),~suppressWarnings(as.numeric(.)))),
      error=function(e){showNotification(paste("Error:",e$message),type="error");data.frame()})
  })

  goalies_raw <- reactive({
    uploaded <- input$upload_goalies
    path <- if(!is.null(uploaded)) uploaded$datapath else "Fantrax-Players-Dynasty_Puck__79_.csv"
    tryCatch(read_csv(path,show_col_types=FALSE) %>%
      mutate(Salary_Num=safe_salary(Salary),across(c(Score,GP,Age),~suppressWarnings(as.numeric(.)))),
      error=function(e){showNotification(paste("Error:",e$message),type="error");data.frame()})
  })

  draft_raw <- reactive({
    uploaded <- input$upload_draft
    path <- if(!is.null(uploaded)) uploaded$datapath else "draft_2026.csv"
    tryCatch(read_csv(path,show_col_types=FALSE),
      error=function(e){showNotification(paste("Error:",e$message),type="error");data.frame()})
  })

  is_prospect <- function(ct,tm,age) (ct=="MNR")

  prospects_all <- reactive({
    sk <- skaters_raw(); gl <- goalies_raw()
    if(nrow(sk)==0 && nrow(gl)==0) return(data.frame())
    sk_sel <- sk %>% select(ID,Player,Team,Position,`Prim Pos`,Status,Age,Salary_Num,Contract,Score,Ros,GP,G,A,`2G+A`,SOG)
    gl_sel <- gl %>% mutate(G=NA_real_,A=NA_real_,`2G+A`=NA_real_,SOG=NA_real_) %>%
      select(ID,Player,Team,Position,`Prim Pos`,Status,Age,Salary_Num,Contract,Score,Ros,GP,G,A,`2G+A`,SOG)
    bind_rows(sk_sel,gl_sel) %>% filter(is_prospect(Contract,Team,Age))
  })

  # All rostered players (for pipeline - expiring BID contracts)
  all_rostered <- reactive({
    sk <- skaters_raw(); gl <- goalies_raw()
    if(nrow(sk)==0 && nrow(gl)==0) return(data.frame())
    sk_sel <- sk %>% select(ID,Player,Team,Position,`Prim Pos`,Status,Age,Salary_Num,Contract,Score,Ros,GP,G,A,`2G+A`,SOG)
    gl_sel <- gl %>% mutate(G=NA_real_,A=NA_real_,`2G+A`=NA_real_,SOG=NA_real_) %>%
      select(ID,Player,Team,Position,`Prim Pos`,Status,Age,Salary_Num,Contract,Score,Ros,GP,G,A,`2G+A`,SOG)
    bind_rows(sk_sel,gl_sel)
  })

  prospects_enriched <- reactive({
    pr <- prospects_all()
    if(nrow(pr)==0) return(pr)
    cgp <- career_gp_cache$data
    if(!is.null(cgp) && nrow(cgp)>0) pr <- pr %>% left_join(cgp, by="Player") else pr$Career_GP <- NA_integer_

    pr %>% mutate(
      GP_Threshold = ifelse(`Prim Pos`=="G", 41L, 82L),
      Career_GP = ifelse(is.na(Career_GP), 0L, Career_GP),
      GP_Pct = round(Career_GP / GP_Threshold * 100, 0),
      MNR_Status = case_when(
        Career_GP >= GP_Threshold ~ "GRADUATED",
        Career_GP >= GP_Threshold * 0.75 ~ "WATCH",
        Career_GP > 0 ~ "DEVELOPING",
        TRUE ~ "SAFE"
      )
    ) %>% rowwise() %>% mutate(
      dv = list(dynasty_value(Score, Age, `Prim Pos`, GP, Contract)),
      Dynasty_Tier = dv$tier,
      Dynasty_Score = dv$score,
      # Feature 2: Fantasy Readiness
      Readiness = fantasy_readiness(Score, Age, GP),
      Readiness_Tier = readiness_tier(Readiness),
      # Feature 3: Per-game rates
      Pts_GP = if(!is.na(GP) && GP > 0 && !is.na(G) && !is.na(A)) round((G + A) / GP, 2) else NA_real_,
      G_GP = if(!is.na(GP) && GP > 0 && !is.na(G)) round(G / GP, 2) else NA_real_,
      Score_GP = if(!is.na(GP) && GP > 0 && !is.na(Score)) round(Score / GP, 2) else NA_real_,
      # Feature 4: Fantasy Impact Timeline (replaces NHL_Debut)
      Impact_Timeline = fantasy_impact_timeline(Score, Age, GP, `Prim Pos`, Readiness),
      Grad_Timeline = project_graduation(Career_GP, GP, `Prim Pos`, Age),
      # Feature 5: ELC Value
      elc_proj = list(elc_value_projection(Score, Age, GP, Readiness)),
      ELC_Projected_Worth = elc_proj$projected_worth,
      ELC_Surplus = elc_proj$surplus,
      ELC_Label = elc_proj$label
    ) %>% ungroup() %>% select(-dv, -elc_proj)
  })

  observeEvent(input$fetch_career_gp, {
    pr <- prospects_all()
    mnr_players <- pr %>% filter(Contract=="MNR")
    if(nrow(mnr_players)==0){ showNotification("No MNR prospects found.", type="warning"); return() }
    showNotification(paste0("Fetching career GP from Hockey Reference for ",nrow(mnr_players)," prospects..."), type="message", duration=10)
    career_gp_cache$status <- "fetching"
    results <- data.frame(Player=character(), Career_GP=integer(), stringsAsFactors=FALSE)
    for(i in seq_len(nrow(mnr_players))){
      row <- mnr_players[i,]
      cgp <- fetch_career_gp_href(row$Player)
      results <- rbind(results, data.frame(Player=row$Player, Career_GP=cgp, stringsAsFactors=FALSE))
      # Brief pause to avoid rate limiting hockey-reference
      Sys.sleep(0.5)
    }
    career_gp_cache$data <- results
    career_gp_cache$status <- "fetched"
    # Save to CSV for next load
    tryCatch(write.csv(results, "mnr_career_gp.csv", row.names=FALSE), error=function(e){})
    showNotification(paste0("Done! Found career GP for ",sum(!is.na(results$Career_GP))," of ",nrow(results)," prospects."), type="message", duration=8)
  })

  observe({
    pr <- prospects_all(); dr <- draft_raw()
    if(nrow(pr)==0) return()
    owners <- sort(unique(pr$Status[pr$Status!="FA"]))
    teams <- sort(unique(pr$Team[pr$Team!="(N/A)"]))
    updateSelectInput(session,"pr_status",choices=c("All",owners))
    updateSelectInput(session,"pr_team",choices=c("All",teams))
    updateSelectInput(session,"pool_owner",choices=c("All",owners))
    updateSelectInput(session,"tv_owner",choices=c("All",owners))
    updateSelectInput(session,"pipe_owner",choices=c("All",owners))
    if(nrow(dr)>0){
      updateSelectInput(session,"dr_tier",choices=c("All",sort(unique(dr$Fantasy_Tier))))
      updateSelectInput(session,"dr_league",choices=c("All",sort(unique(dr$League))))
      updateSelectInput(session,"dr_nat",choices=c("All",sort(unique(dr$Nationality))))
    }
  })

  # Update compare dropdowns when prospects change
  observe({
    pr <- prospects_enriched()
    if(nrow(pr)==0) return()
    player_choices <- c("(select)"="", sort(pr$Player))
    updateSelectInput(session,"compare_a",choices=player_choices)
    updateSelectInput(session,"compare_b",choices=player_choices)
  })

  # Update trade value player selectors
  observe({
    pr <- prospects_enriched()
    if(nrow(pr)==0) return()
    player_choices <- sort(pr$Player)
    updateSelectInput(session,"tv_side_a",choices=player_choices)
    updateSelectInput(session,"tv_side_b",choices=player_choices)
  })

  # Reset Filters
  observeEvent(input$pr_reset_filters, {
    updateSelectInput(session,"pr_pos",selected="All")
    updateSliderInput(session,"pr_age",value=c(16,25))
    updateSelectInput(session,"pr_status",selected="All")
    updateSelectInput(session,"pr_team",selected="All")
    updateSelectInput(session,"pr_dynasty",selected="All")
    updateCheckboxInput(session,"pr_has_gp",value=FALSE)
  })

  make_btn <- function(lbl,url,tp) sprintf('<span class="link-btn" onclick="Shiny.setInputValue(\'%s_open_url\',\'%s\',{priority:\'event\'})">%s</span>',tp,gsub("'","%27",url),lbl)

  # Helper: format salary for display
  fmt_salary <- function(x) {
    if(is.na(x)) return("-")
    if(x >= 1000000) paste0("$",round(x/1000000,1),"M")
    else paste0("$",format(x,big.mark=",",scientific=FALSE))
  }

  prospect_card <- function(row, tp){
    enc <- URLencode(row$Player,reserved=TRUE)
    nq <- URLencode(paste(row$Player,"hockey news"),reserved=TRUE)
    pq <- URLencode(paste(row$Player,"prospect scouting"),reserved=TRUE)
    xq <- URLencode(paste(row$Player,"hockey"),reserved=TRUE)
    tl <- ifelse(is.na(row$Team)|row$Team=="(N/A)","Unaffiliated",row$Team)
    cb <- ifelse(row$Contract=="MNR",'<span class="badge-mnr">MNR</span>','<span class="badge-prospect">PROSPECT</span>')
    score_display <- ifelse(!is.na(row$Score) & row$Score > 0, paste0(' \u2022 Score: <b style="color:#a371f7">',row$Score,'</b>'), "")
    gp_display <- ifelse(!is.na(row$GP) & row$GP > 0, paste0(' \u2022 ',row$GP,' season GP'), "")

    # Per-game rates display (Feature 3)
    pergame_html <- ""
    if(!is.na(row$GP) && row$GP > 0) {
      score_gp_display <- if(!is.na(row$Score_GP)) row$Score_GP else "-"
      pts_gp_display <- if(!is.na(row$Pts_GP)) row$Pts_GP else "-"
      g_gp_display <- if(!is.na(row$G_GP)) row$G_GP else "-"
      pergame_html <- paste0(
        '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Score/GP</div><div class="val-value" style="color:#f0883e;">',score_gp_display,'</div></div>',
        '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Pts/GP</div><div class="val-value" style="color:#58a6ff;">',pts_gp_display,'</div></div>',
        '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">G/GP</div><div class="val-value" style="color:#3fb950;">',g_gp_display,'</div></div>')
    }

    # Readiness display (Feature 2)
    readiness_class <- paste0("readiness-",tolower(gsub(" ","",row$Readiness_Tier)))
    readiness_html <- paste0(
      '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Readiness</div><div class="val-value ',readiness_class,'">',row$Readiness,' (',row$Readiness_Tier,')</div></div>')

    # Dynasty value card
    dv_class <- paste0("dv-",tolower(gsub(" ","",row$Dynasty_Tier)))
    val_html <- paste0(
      '<div style="display:flex;gap:12px;margin:10px 0;flex-wrap:wrap;">',
      '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Dynasty Ceiling</div><div class="val-value ',dv_class,'">',row$Dynasty_Tier,'</div></div>',
      '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Dynasty Score</div><div class="val-value" style="color:#a371f7;">',row$Dynasty_Score,'</div></div>',
      readiness_html,
      '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Impact Timeline</div><div class="val-value" style="color:#58a6ff;">',row$Impact_Timeline,'</div></div>',
      '<div class="val-card" style="flex:1;min-width:140px;"><div class="val-label">Graduation</div><div class="val-value" style="color:',
        ifelse(row$Grad_Timeline=="GRADUATED","#f85149",ifelse(row$Grad_Timeline %in% c("This season","2026-27"),"#f0883e","#8b949e")),';">',row$Grad_Timeline,'</div></div>',
      pergame_html,
      '</div>')

    # ELC Value display (Feature 5)
    elc_html <- ""
    if(!is.na(row$ELC_Projected_Worth) && row$ELC_Projected_Worth > 0) {
      elc_html <- paste0(
        '<div class="elc-value-card">',
        '<div style="font-size:.85em;color:#8b949e;">ELC Value Projection</div>',
        '<div style="margin-top:4px;font-size:.9em;">',
        'ELC Salary: <b style="color:#58a6ff;">$1.5M</b> (2-year deal) ',
        '\u2192 Projected Worth: <b style="color:#f0883e;">',fmt_salary(row$ELC_Projected_Worth),'</b> ',
        '\u2192 Surplus: <b class="elc-surplus">+',fmt_salary(row$ELC_Surplus),'</b> ',
        '<span style="color:#a371f7;font-weight:600;">(',row$ELC_Label,')</span>',
        '</div></div>')
    }

    # MNR threshold bar
    threshold_html <- ""
    if(!is.na(row$Career_GP) && row$Career_GP > 0 && row$Contract=="MNR"){
      threshold <- row$GP_Threshold
      pct <- min(100, row$GP_Pct)
      fill_class <- case_when(row$MNR_Status=="GRADUATED"~"threshold-graduated",row$MNR_Status=="WATCH"~"threshold-watch",TRUE~"threshold-safe")
      status_badge <- case_when(
        row$MNR_Status=="GRADUATED" ~ '<span class="badge-graduating">GRADUATED \u2014 MUST SIGN ELC</span>',
        row$MNR_Status=="WATCH" ~ '<span class="badge-graduating">WATCH \u2014 NEAR THRESHOLD</span>',
        TRUE ~ "")
      threshold_html <- paste0(
        '<div style="margin:6px 0;padding:10px;background:#0d1117;border:1px solid #21262d;border-radius:8px;">',
        '<div style="font-size:.85em;color:#8b949e;">Career NHL GP: <b style="color:#c9d1d9">',row$Career_GP,'</b> / ',threshold,' threshold ',status_badge,'</div>',
        '<div class="threshold-bar"><div class="threshold-fill ',fill_class,'" style="width:',pct,'%"></div></div>',
        '</div>')
    }

    paste0('<div class="player-card"><h3>',htmltools::htmlEscape(row$Player),' ',cb,'</h3>',
      '<div class="meta">',row$`Prim Pos`,' \u2022 ',tl,' \u2022 Age: ',row$Age,score_display,gp_display,'</div>',
      val_html, elc_html, threshold_html,
      '<div class="link-section"><h4>\u2B50 Development & Scouting</h4>',
        make_btn("Elite Prospects",paste0("https://www.eliteprospects.com/search/player?q=",enc),tp),
        make_btn("Scouting Reports",paste0("https://www.google.com/search?q=",pq),tp),
        make_btn("Draft Profile",paste0("https://www.google.com/search?q=",URLencode(paste(row$Player,"NHL draft profile"),reserved=TRUE)),tp),
        make_btn("Dobber Prospects",paste0("https://dobberprospects.com/search/?s=",enc),tp),
        make_btn("Highlights",paste0("https://www.youtube.com/results?search_query=",URLencode(paste(row$Player,"hockey highlights"),reserved=TRUE)),tp),'</div>',
      '<div class="link-section"><h4>\U0001F4F0 News</h4>',
        make_btn("\U0001F4F0 Google News",paste0("https://news.google.com/search?q=",nq),tp),
        make_btn("Fantasy Value",paste0("https://www.google.com/search?q=",URLencode(paste(row$Player,"fantasy hockey prospect dynasty"),reserved=TRUE)),tp),
        make_btn("NHL Pipeline",paste0("https://www.google.com/search?q=",URLencode(paste(row$Player,"prospect pipeline NHL"),reserved=TRUE)),tp),'</div>',
      '<div class="link-section"><h4>\U0001F4AC Social & Video</h4>',
        make_btn("X/Twitter",paste0("https://x.com/search?q=",xq,"&f=live"),tp),
        make_btn("Reddit",paste0("https://www.reddit.com/search/?q=",nq,"&sort=new"),tp),
        make_btn("YouTube",paste0("https://www.youtube.com/results?search_query=",nq),tp),'</div></div>')
  }

  render_browser <- function(url){
    if(is.null(url)) return(div(class="browser-placeholder",div(class="icon","\U0001F310"),p("Click a link above to preview it here")))
    tagList(div(class="browser-bar",div(class="dots",tags$span(class="dot dot-r"),tags$span(class="dot dot-y"),tags$span(class="dot dot-g")),div(class="url-display",url),tags$a("Open \u2197",href=url,target="_blank",style="color:#58a6ff;font-size:.85em;text-decoration:none;font-weight:600;")),tags$iframe(src=url,class="browser-frame",frameborder="0",sandbox="allow-same-origin allow-scripts allow-popups allow-forms"))
  }

  # ═══════ PROSPECT ROSTER ═══════
  pr_f <- reactive({
    df <- prospects_enriched()
    if(nrow(df)==0) return(df)
    df <- df %>% filter(Age>=input$pr_age[1], Age<=input$pr_age[2])
    if(input$pr_pos!="All") df <- df %>% filter(`Prim Pos`==input$pr_pos)
    if(input$pr_dynasty!="All") df <- df %>% filter(Dynasty_Tier==input$pr_dynasty)
    if(input$pr_status!="All") df <- df %>% filter(Status==input$pr_status)
    if(input$pr_team!="All") df <- df %>% filter(Team==input$pr_team)
    if(input$pr_has_gp) df <- df %>% filter(GP>0)
    df
  })

  output$pr_stats <- renderUI({
    df <- pr_f()
    if(nrow(df)==0) return(div(class="empty-state",
      div(class="empty-icon","\U0001F50D"),
      div(class="empty-title","No prospects found"),
      div(class="empty-desc","Try adjusting your filters or uploading prospect data.")))
    n_mnr <- sum(df$Contract=="MNR",na.rm=TRUE)
    n_franchise <- sum(df$Dynasty_Tier %in% c("Franchise","Star"),na.rm=TRUE)
    n_graduated <- sum(df$MNR_Status=="GRADUATED",na.rm=TRUE)
    n_nhl_ready <- sum(df$Readiness_Tier=="NHL Ready",na.rm=TRUE)
    avg_age <- round(mean(df$Age,na.rm=TRUE),1)
    avg_dyn <- round(mean(df$Dynasty_Score,na.rm=TRUE),1)
    avg_readiness <- round(mean(df$Readiness,na.rm=TRUE),1)
    div(class="stat-bar",
      div(class="stat-box",div(class="num",nrow(df)),div(class="lbl","Prospects")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_mnr),div(class="lbl","MNR")),
      div(class="stat-box",div(class="num",style="color:#ffd700",n_franchise),div(class="lbl","Star+")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_nhl_ready),div(class="lbl","NHL Ready")),
      div(class="stat-box",div(class="num",style="color:#f85149",n_graduated),div(class="lbl","Graduated")),
      div(class="stat-box",div(class="num",avg_dyn),div(class="lbl","Avg Dynasty")),
      div(class="stat-box",div(class="num",avg_readiness),div(class="lbl","Avg Readiness")))
  })

  output$pr_table <- renderDT({
    df <- pr_f()
    if(nrow(df)==0) return(datatable(data.frame(Message="No prospects match filters"),rownames=FALSE))
    display <- df %>%
      mutate(
        Score_GP_display = ifelse(is.na(Score_GP), "-", as.character(Score_GP)),
        Pts_GP_display = ifelse(is.na(Pts_GP), "-", as.character(Pts_GP)),
        G_GP_display = ifelse(is.na(G_GP), "-", as.character(G_GP)),
        ELC_Surplus_display = ifelse(!is.na(ELC_Surplus) & ELC_Surplus > 0,
          paste0("+$", ifelse(ELC_Surplus >= 1000000, paste0(round(ELC_Surplus/1000000,1),"M"), format(ELC_Surplus,big.mark=",",scientific=FALSE))), "-")
      ) %>%
      select(Player,Team,`Prim Pos`,Age,Status,Contract,Score,Dynasty_Tier,Dynasty_Score,
             Readiness,Readiness_Tier,Impact_Timeline,Score_GP_display,Pts_GP_display,
             GP,Career_GP,MNR_Status,Grad_Timeline,ELC_Surplus_display) %>%
      arrange(desc(Dynasty_Score))
    datatable(display, selection="single",rownames=FALSE,
      colnames=c("Player","Team","Pos","Age","Owner","Contract","Score","Ceiling","Dyn Score",
                 "Ready","Ready Tier","Impact","Score/GP","Pts/GP",
                 "GP","Career GP","MNR","Graduation","ELC Surplus"),
      options=list(pageLength=25,scrollX=TRUE,dom='lftipr',order=list(list(8,'desc')),
        language=list(search="Search prospects:"))) %>%
      formatStyle('Contract',backgroundColor=styleEqual(c("MNR","FA"),c("#0a3d1a","#21262d")),
        color=styleEqual(c("MNR","FA"),c("#3fb950","#8b949e")),fontWeight='bold') %>%
      formatStyle('Dynasty_Tier',
        color=styleEqual(c("Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","High Upside","Developing","Longshot"),
          c("#ffd700","#f0883e","#3fb950","#58a6ff","#8b949e","#6e7681","#a371f7","#58a6ff","#484f58")),fontWeight='bold') %>%
      formatStyle('Readiness_Tier',
        color=styleEqual(c("NHL Ready","Near Ready","Developing","Raw","Long-term Stash"),
          c("#3fb950","#58a6ff","#f0883e","#8b949e","#484f58")),fontWeight='bold') %>%
      formatStyle('MNR_Status',
        backgroundColor=styleEqual(c("GRADUATED","WATCH","DEVELOPING","SAFE"),c("#3d1418","#3d2a0a","#1a2d4a","#0d1117")),
        color=styleEqual(c("GRADUATED","WATCH","DEVELOPING","SAFE"),c("#f85149","#f0883e","#58a6ff","#8b949e")),fontWeight='bold') %>%
      formatStyle('Dynasty_Score',background=styleColorBar(c(0,max(df$Dynasty_Score,na.rm=TRUE)),'rgba(163,113,247,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('Readiness',background=styleColorBar(c(0,100),'rgba(63,185,80,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$pr_card <- renderUI({
    sel <- input$pr_table_rows_selected; if(is.null(sel)) return(NULL)
    r <- (pr_f() %>% arrange(desc(Dynasty_Score)))[sel,]
    HTML(prospect_card(r,"pr"))
  })
  observeEvent(input$pr_open_url,{browser_url$pr<-input$pr_open_url})
  output$pr_browser <- renderUI({render_browser(browser_url$pr)})

  # ═══════ COMPARE PROSPECTS ═══════
  output$pr_compare_card <- renderUI({
    req(input$compare_a, input$compare_b)
    if(input$compare_a=="" || input$compare_b=="") return(NULL)
    if(input$compare_a==input$compare_b) return(NULL)

    df <- prospects_enriched()
    if(nrow(df)==0) return(NULL)

    pa <- df %>% filter(Player==input$compare_a)
    pb <- df %>% filter(Player==input$compare_b)
    if(nrow(pa)==0 || nrow(pb)==0) return(NULL)
    pa <- pa[1,]; pb <- pb[1,]

    # Tier ordering for comparison
    tier_order <- c("Franchise"=9,"Star"=8,"Top Line"=7,"High Upside"=6,"Middle Six"=5,
                    "Developing"=4,"Bottom Six"=3,"Depth Prospect"=2,"Depth"=2,"Longshot"=1,"Unknown"=0)

    make_compare_row <- function(label, va, vb, higher_is_better=TRUE, is_tier=FALSE) {
      if(is_tier) {
        va_num <- ifelse(va %in% names(tier_order), tier_order[va], 0)
        vb_num <- ifelse(vb %in% names(tier_order), tier_order[vb], 0)
      } else {
        va_num <- suppressWarnings(as.numeric(va))
        vb_num <- suppressWarnings(as.numeric(vb))
        if(is.na(va_num)) va_num <- 0
        if(is.na(vb_num)) vb_num <- 0
      }

      if(!higher_is_better) { va_num <- -va_num; vb_num <- -vb_num }

      if(va_num > vb_num) { ca <- "compare-win"; cb <- "compare-lose" }
      else if(vb_num > va_num) { ca <- "compare-lose"; cb <- "compare-win" }
      else { ca <- "compare-tie"; cb <- "compare-tie" }

      paste0('<div class="compare-row">',
        '<div class="compare-label">',label,'</div>',
        '<div class="compare-val ',ca,'">',va,'</div>',
        '<div class="compare-val ',cb,'">',vb,'</div>',
        '</div>')
    }

    # Build comparison rows
    rows <- paste0(
      '<div class="compare-row">',
        '<div class="compare-label"></div>',
        '<div class="compare-val" style="background:#161b22;color:#a371f7;border:1px solid #30363d;font-weight:700;">',htmltools::htmlEscape(pa$Player),'</div>',
        '<div class="compare-val" style="background:#161b22;color:#a371f7;border:1px solid #30363d;font-weight:700;">',htmltools::htmlEscape(pb$Player),'</div>',
      '</div>',
      make_compare_row("Dynasty Tier", pa$Dynasty_Tier, pb$Dynasty_Tier, TRUE, TRUE),
      make_compare_row("Dynasty Score", pa$Dynasty_Score, pb$Dynasty_Score),
      make_compare_row("Readiness", pa$Readiness, pb$Readiness),
      make_compare_row("Position", pa$`Prim Pos`, pb$`Prim Pos`, TRUE, FALSE),
      make_compare_row("Age", pa$Age, pb$Age, FALSE),
      make_compare_row("Score", ifelse(is.na(pa$Score),0,pa$Score), ifelse(is.na(pb$Score),0,pb$Score)),
      make_compare_row("Score/GP", ifelse(is.na(pa$Score_GP),0,pa$Score_GP), ifelse(is.na(pb$Score_GP),0,pb$Score_GP)),
      make_compare_row("GP", ifelse(is.na(pa$GP),0,pa$GP), ifelse(is.na(pb$GP),0,pb$GP)),
      make_compare_row("Impact", pa$Impact_Timeline, pb$Impact_Timeline, TRUE, FALSE),
      make_compare_row("Graduation", pa$Grad_Timeline, pb$Grad_Timeline, TRUE, FALSE)
    )

    # Quick outlook
    dv_a_class <- paste0("dv-",tolower(gsub(" ","",pa$Dynasty_Tier)))
    dv_b_class <- paste0("dv-",tolower(gsub(" ","",pb$Dynasty_Tier)))

    outlook <- paste0(
      '<div style="display:flex;gap:12px;margin-top:14px;">',
      '<div style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;">',
      '<div style="font-size:.78em;color:#8b949e;text-transform:uppercase;">Dynasty Outlook</div>',
      '<div class="',dv_a_class,'" style="font-size:1em;margin-top:4px;">',pa$Dynasty_Tier,' (',pa$Dynasty_Score,')</div>',
      '<div style="color:#8b949e;font-size:.8em;margin-top:4px;">Impact: ',pa$Impact_Timeline,' | Readiness: ',pa$Readiness,' | Grad: ',pa$Grad_Timeline,'</div></div>',
      '<div style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;">',
      '<div style="font-size:.78em;color:#8b949e;text-transform:uppercase;">Dynasty Outlook</div>',
      '<div class="',dv_b_class,'" style="font-size:1em;margin-top:4px;">',pb$Dynasty_Tier,' (',pb$Dynasty_Score,')</div>',
      '<div style="color:#8b949e;font-size:.8em;margin-top:4px;">Impact: ',pb$Impact_Timeline,' | Readiness: ',pb$Readiness,' | Grad: ',pb$Grad_Timeline,'</div></div>',
      '</div>')

    HTML(paste0('<div class="compare-card"><h4>Prospect Comparison</h4>',rows,outlook,'</div>'))
  })

  # ═══════ POOL RANKINGS ═══════
  pool_data <- reactive({
    pr <- prospects_enriched() %>% filter(Contract=="MNR", Status!="FA")
    if(nrow(pr)==0) return(data.frame())
    owners <- sort(unique(pr$Status))
    lapply(owners, function(ow){
      pool <- pr %>% filter(Status==ow) %>% arrange(desc(Score))
      n <- nrow(pool)
      scores <- pool$Score[1:min(8,n)]
      s1 <- ifelse(length(scores)>=1, scores[1], 0)
      s2 <- ifelse(length(scores)>=2, scores[2], 0)
      s3 <- ifelse(length(scores)>=3, scores[3], 0)
      depth_scores <- scores[4:min(8,length(scores))]
      depth_avg <- ifelse(length(depth_scores)>0 & !all(is.na(depth_scores)), mean(depth_scores,na.rm=TRUE), 0)
      nhl_ready <- sum(pool$GP > 0, na.rm=TRUE)
      avg_age <- mean(pool$Age, na.rm=TRUE)
      youth_factor <- min(50, max(0, (24 - avg_age) * 12.5))
      size_bonus <- min(40, n * 2)
      n_graduated <- sum(pool$MNR_Status=="GRADUATED", na.rm=TRUE)
      n_watch <- sum(pool$MNR_Status=="WATCH", na.rm=TRUE)
      grad_penalty <- (n_graduated * 4) + (n_watch * 1.5)
      potential <- round((s1*0.35)+(s2*0.18)+(s3*0.10)+(depth_avg*0.12)+(nhl_ready*6*0.10)+(youth_factor*0.08)+(size_bonus*0.07)-grad_penalty,1)
      potential <- max(0, potential)
      f_count <- sum(pool$`Prim Pos`=="F",na.rm=TRUE); d_count <- sum(pool$`Prim Pos`=="D",na.rm=TRUE); g_count <- sum(pool$`Prim Pos`=="G",na.rm=TRUE)
      tier <- case_when(potential>=40~"Elite",potential>=28~"Strong",potential>=18~"Average",potential>=10~"Weak",TRUE~"Rebuilding")
      elc_cost <- n_graduated * 1500000
      # Dynasty tier distribution
      n_star_plus <- sum(pool$Dynasty_Tier %in% c("Franchise","Star"),na.rm=TRUE)
      n_topline <- sum(pool$Dynasty_Tier=="Top Line",na.rm=TRUE)
      avg_dynasty <- round(mean(pool$Dynasty_Score,na.rm=TRUE),1)

      strengths <- c()
      weaknesses <- c()
      if(s1>=60) strengths<-c(strengths,paste0("Franchise prospect (",pool$Player[1],")"))
      else if(s1>=40) strengths<-c(strengths,paste0("Star prospect (",pool$Player[1],")"))
      if(nhl_ready>=3) strengths<-c(strengths,paste0(nhl_ready," NHL-ready"))
      if(avg_age<=20) strengths<-c(strengths,"Very young pool") else if(avg_age<=21) strengths<-c(strengths,"Young pool")
      if(d_count>=5) strengths<-c(strengths,"D pipeline")
      if(s2>=35) strengths<-c(strengths,"Strong 1-2 punch")
      if(depth_avg>=15) strengths<-c(strengths,"Great depth")
      if(n_graduated>0) weaknesses<-c(weaknesses,paste0(n_graduated," must sign ELC"))
      if(n_watch>0) weaknesses<-c(weaknesses,paste0(n_watch," near threshold"))
      if(s1<25) weaknesses<-c(weaknesses,"No high-end talent")
      if(nhl_ready==0) weaknesses<-c(weaknesses,"No NHL-ready")
      if(d_count<=1) weaknesses<-c(weaknesses,"Thin D pipeline")
      if(n<=12) weaknesses<-c(weaknesses,"Small pool")
      if(length(strengths)==0) strengths<-"Balanced"
      if(length(weaknesses)==0) weaknesses<-"No major gaps"

      data.frame(Owner=ow,Potential=potential,Tier=tier,
        Top_Prospect=paste0(pool$Player[1]," (",round(s1,0),")"),
        S2=round(s2,0),S3=round(s3,0),Depth=round(depth_avg,0),
        NHL_Ready=nhl_ready,Graduated=n_graduated,Watch=n_watch,ELC_Cost=elc_cost,
        Star_Plus=n_star_plus,Top_Line=n_topline,Avg_Dynasty=avg_dynasty,
        Total=n,F=f_count,D=d_count,G=g_count,Avg_Age=round(avg_age,1),
        Strengths=paste(head(strengths,3),collapse="; "),
        Weaknesses=paste(head(weaknesses,3),collapse="; "),
        stringsAsFactors=FALSE)
    }) %>% bind_rows() %>% arrange(desc(Potential))
  })

  output$pool_table <- renderDT({
    pools <- pool_data()
    if(nrow(pools)==0) return(datatable(data.frame(Message="Upload prospect data to see pool rankings"),rownames=FALSE))
    pools$Rank <- 1:nrow(pools)
    display <- pools %>% select(Rank,Owner,Potential,Tier,Top_Prospect,Star_Plus,Top_Line,Avg_Dynasty,NHL_Ready,Graduated,Watch,Total,Avg_Age)
    datatable(display, rownames=FALSE, selection="single",
      colnames=c("Rank","Owner","Potential","Tier","Top Prospect","Star+","Top Line","Avg Dyn","NHL Ready","Grad","Watch","Total","Avg Age"),
      options=list(pageLength=14,scrollX=TRUE,dom='t',order=list(list(0,'asc')))) %>%
      formatStyle('Tier',color=styleEqual(c("Elite","Strong","Average","Weak","Rebuilding"),c("#f0883e","#3fb950","#58a6ff","#f85149","#f85149")),fontWeight='bold') %>%
      formatStyle('Potential',background=styleColorBar(range(pools$Potential),'rgba(163,113,247,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('Graduated',color=styleInterval(c(0,1),c("#8b949e","#f0883e","#f85149")),fontWeight='bold') %>%
      formatStyle('Star_Plus',color=styleInterval(c(0,1),c("#8b949e","#f0883e","#ffd700")),fontWeight='bold') %>%
      formatStyle('Avg_Dynasty',background=styleColorBar(range(pools$Avg_Dynasty),'rgba(163,113,247,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  observeEvent(input$pool_table_rows_selected,{
    sel<-input$pool_table_rows_selected;if(!is.null(sel)){pools<-pool_data();if(nrow(pools)>=sel)updateSelectInput(session,"pool_owner",selected=pools$Owner[sel])}
  })

  output$pool_detail <- renderUI({
    if(input$pool_owner=="All") return(div(class="pool-card",h4("Select an owner to view their prospect pool"),p("Click a row or use the dropdown.",style="color:#484f58;")))
    ow <- input$pool_owner
    pool <- prospects_enriched() %>% filter(Contract=="MNR",Status==ow) %>% arrange(desc(Dynasty_Score))
    if(nrow(pool)==0) return(div(class="pool-card",h4("No MNR prospects")))

    ranking <- pool_data() %>% filter(Owner==ow)
    rank_display <- ""
    if(nrow(ranking)>0){
      all_ranks <- pool_data() %>% arrange(desc(Potential))
      rank_num <- which(all_ranks$Owner==ow)
      rank_class <- case_when(rank_num==1~"rank-1",rank_num==2~"rank-2",rank_num==3~"rank-3",TRUE~"rank-other")
      elc_info <- if(ranking$ELC_Cost>0) paste0(' \u2022 <span style="color:#f85149">ELC cost: $',format(ranking$ELC_Cost,big.mark=",",scientific=FALSE),'/yr</span>') else ""
      rank_display <- paste0('<div style="margin-bottom:14px;">',
        '<span class="rank-badge ',rank_class,'">',rank_num,'</span>',
        '<span style="font-size:1.2em;font-weight:700;color:#c9d1d9;">',htmltools::htmlEscape(ow),'</span>',
        ' \u2022 Potential: <b style="color:#a371f7;">',ranking$Potential,'</b>',
        ' \u2022 <b style="color:#ffd700">',ranking$Star_Plus,'</b> Star+ prospects',
        ' \u2022 Avg Dynasty: <b style="color:#a371f7">',ranking$Avg_Dynasty,'</b>',elc_info,
        '</div>',
        '<div class="meta" style="margin-bottom:4px;"><b>Strengths:</b> <span style="color:#3fb950;">',ranking$Strengths,'</span></div>',
        '<div class="meta"><b>Weaknesses:</b> <span style="color:#f85149;">',ranking$Weaknesses,'</span></div>')
    }

    # Build roster grouped by dynasty tier
    make_pool_row <- function(p) {
      dv_class <- paste0("dv-",tolower(gsub(" ","",p$Dynasty_Tier)))
      impact <- paste0('<span style="color:#58a6ff">',p$Impact_Timeline,'</span>')
      grad <- ifelse(p$Grad_Timeline %in% c("GRADUATED","This season","2026-27"),paste0('<span style="color:#f85149">',p$Grad_Timeline,'</span>'),paste0('<span style="color:#8b949e">',p$Grad_Timeline,'</span>'))
      readiness_col <- readiness_color(p$Readiness)
      paste0('<div class="pool-player"><b>',htmltools::htmlEscape(p$Player),'</b> \u2014 ',p$`Prim Pos`,', ',p$Team,', Age ',p$Age,
        ' \u2022 <span class="',dv_class,'">',p$Dynasty_Tier,' (',p$Dynasty_Score,')</span>',
        ' \u2022 <span style="color:',readiness_col,'">Ready: ',p$Readiness,'</span>',
        ' \u2022 Impact: ',impact,' \u2022 Grad: ',grad,'</div>')
    }

    # Group by tier
    franchise <- pool %>% filter(Dynasty_Tier %in% c("Franchise","Star"))
    topline <- pool %>% filter(Dynasty_Tier == "Top Line")
    middle <- pool %>% filter(Dynasty_Tier == "Middle Six")
    depth <- pool %>% filter(Dynasty_Tier %in% c("Bottom Six","Depth"))
    developing <- pool %>% filter(Dynasty_Tier %in% c("High Upside","Developing","Longshot"))

    sections <- ""
    if(nrow(franchise)>0) sections <- paste0(sections,'<h4 style="color:#ffd700;margin-top:16px;font-weight:700;">Franchise / Star (',nrow(franchise),')</h4>',paste0(sapply(1:nrow(franchise),function(i)make_pool_row(franchise[i,])),collapse=""))
    if(nrow(topline)>0) sections <- paste0(sections,'<h4 style="color:#3fb950;margin-top:16px;font-weight:700;">Top Line (',nrow(topline),')</h4>',paste0(sapply(1:nrow(topline),function(i)make_pool_row(topline[i,])),collapse=""))
    if(nrow(middle)>0) sections <- paste0(sections,'<h4 style="color:#58a6ff;margin-top:16px;font-weight:700;">Middle Six (',nrow(middle),')</h4>',paste0(sapply(1:nrow(middle),function(i)make_pool_row(middle[i,])),collapse=""))
    if(nrow(depth)>0) sections <- paste0(sections,'<h4 style="color:#8b949e;margin-top:16px;font-weight:700;">Bottom Six / Depth (',nrow(depth),')</h4>',paste0(sapply(1:nrow(depth),function(i)make_pool_row(depth[i,])),collapse=""))
    if(nrow(developing)>0) sections <- paste0(sections,'<h4 style="color:#a371f7;margin-top:16px;font-weight:700;">Developing (',nrow(developing),')</h4>',paste0(sapply(1:nrow(developing),function(i)make_pool_row(developing[i,])),collapse=""))

    HTML(paste0('<div class="pool-card">',rank_display,
      '<div class="meta" style="margin-top:12px;">',nrow(pool),' MNR \u2022 F: ',sum(pool$`Prim Pos`=="F",na.rm=TRUE),
      ' \u2022 D: ',sum(pool$`Prim Pos`=="D",na.rm=TRUE),' \u2022 G: ',sum(pool$`Prim Pos`=="G",na.rm=TRUE),
      ' \u2022 Avg Age: ',round(mean(pool$Age,na.rm=TRUE),1),'</div>',
      sections,'</div>'))
  })

  # ═══════ PIPELINE (Feature 1) ═══════
  # Get expiring BID contracts for an owner
  expiring_contracts <- reactive({
    if(input$pipe_owner=="All") return(data.frame())
    ow <- input$pipe_owner
    all_players <- all_rostered()
    if(nrow(all_players)==0) return(data.frame())
    # Expiring BID = Contract=="BID" and Salary between $1M and $2.49M (1-year deals)
    all_players %>%
      filter(Status == ow, Contract == "BID",
             !is.na(Salary_Num), Salary_Num >= 1000000, Salary_Num < 2500000) %>%
      arrange(desc(Score))
  })

  output$pipe_summary <- renderUI({
    if(input$pipe_owner=="All") return(div(class="empty-state",
      div(class="empty-icon","\U0001F504"),
      div(class="empty-title","Select an owner to view their pipeline"),
      div(class="empty-desc","Choose an owner from the dropdown to see expiring contracts, prospect replacements, and position gaps.")))

    ow <- input$pipe_owner
    expiring <- expiring_contracts()
    prospects <- prospects_enriched() %>% filter(Contract=="MNR", Status==ow) %>% arrange(desc(Dynasty_Score))

    n_expiring <- nrow(expiring)
    n_ready <- sum(prospects$Readiness >= 50, na.rm=TRUE)

    # Position gap analysis
    expiring_positions <- if(n_expiring > 0) unique(expiring$`Prim Pos`) else character(0)
    ready_positions <- if(nrow(prospects) > 0) unique(prospects$`Prim Pos`[prospects$Readiness >= 30]) else character(0)
    gap_positions <- setdiff(expiring_positions, ready_positions)
    n_gaps <- length(gap_positions)

    div(class="stat-bar",
      div(class="stat-box",div(class="num",style="color:#f0883e",n_expiring),div(class="lbl","Expiring Contracts")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_ready),div(class="lbl","Ready Prospects")),
      div(class="stat-box",div(class="num",style="color:#f85149",n_gaps),div(class="lbl","Position Gaps")),
      div(class="stat-box",div(class="num",nrow(prospects)),div(class="lbl","MNR Prospects")))
  })

  output$pipe_detail <- renderUI({
    if(input$pipe_owner=="All") return(NULL)
    ow <- input$pipe_owner

    expiring <- expiring_contracts()
    prospects <- prospects_enriched() %>% filter(Contract=="MNR", Status==ow) %>% arrange(desc(Readiness))

    if(nrow(expiring)==0 && nrow(prospects)==0) {
      return(div(class="pipeline-card",h4("No Data"),
        p("This owner has no expiring BID contracts and no MNR prospects.",style="color:#484f58;")))
    }

    # Build the two-column layout
    # Left: expiring contracts with stats
    left_html <- '<div style="flex:1;min-width:300px;">'
    left_html <- paste0(left_html, '<h4 style="color:#f0883e;margin:0 0 12px;font-weight:700;">Expiring BID Contracts (',nrow(expiring),')</h4>')

    if(nrow(expiring)==0) {
      left_html <- paste0(left_html, '<p style="color:#484f58;">No expiring BID contracts ($1M-$2.49M).</p>')
    } else {
      for(i in seq_len(nrow(expiring))) {
        row <- expiring[i,]
        score_display <- if(!is.na(row$Score)) paste0("Score: ",round(row$Score,1)) else "No score"
        gp_display <- if(!is.na(row$GP) && row$GP > 0) paste0(row$GP," GP") else "0 GP"
        salary_display <- fmt_salary(row$Salary_Num)

        # Find matching prospects by position
        pos_matches <- prospects %>% filter(`Prim Pos` == row$`Prim Pos`) %>% head(3)

        replacements_html <- ""
        if(nrow(pos_matches) > 0) {
          for(j in seq_len(nrow(pos_matches))) {
            pm <- pos_matches[j,]
            rcolor <- readiness_color(pm$Readiness)
            rclass <- if(pm$Readiness >= 50) "pipeline-ready" else if(pm$Readiness >= 30) "pipeline-developing" else "pipeline-none"
            replacements_html <- paste0(replacements_html,
              '<div class="pipeline-replacement ',rclass,'">',
              htmltools::htmlEscape(pm$Player),' \u2022 Ready: ',pm$Readiness,
              ' \u2022 ',pm$Readiness_Tier,' \u2022 Dyn: ',pm$Dynasty_Score,
              '</div>')
          }
        } else {
          replacements_html <- '<div class="pipeline-replacement pipeline-none">No prospects at this position</div>'
        }

        left_html <- paste0(left_html,
          '<div class="pipeline-expiring">',
          '<div class="exp-name">',htmltools::htmlEscape(row$Player),' <span style="color:#8b949e;font-size:.8em;">(',row$`Prim Pos`,')</span></div>',
          '<div class="exp-meta">',salary_display,' \u2022 ',score_display,' \u2022 ',gp_display,'</div>',
          '<div style="margin-top:6px;font-size:.78em;color:#8b949e;text-transform:uppercase;">Prospect Replacements:</div>',
          replacements_html,
          '</div>')
      }
    }
    left_html <- paste0(left_html, '</div>')

    # Right: prospects ranked by readiness
    right_html <- '<div style="flex:1;min-width:300px;">'
    right_html <- paste0(right_html, '<h4 style="color:#3fb950;margin:0 0 12px;font-weight:700;">MNR Prospects by Readiness (',nrow(prospects),')</h4>')

    if(nrow(prospects)==0) {
      right_html <- paste0(right_html, '<p style="color:#484f58;">No MNR prospects.</p>')
    } else {
      for(i in seq_len(min(15, nrow(prospects)))) {
        p_row <- prospects[i,]
        rcolor <- readiness_color(p_row$Readiness)
        score_display <- if(!is.na(p_row$Score) && p_row$Score > 0) paste0("Score: ",round(p_row$Score,1)) else "No NHL score"
        elc_display <- ""
        if(!is.na(p_row$ELC_Surplus) && p_row$ELC_Surplus > 0) {
          elc_display <- paste0(' \u2022 <span style="color:#3fb950">ELC +',fmt_salary(p_row$ELC_Surplus),'</span>')
        }
        right_html <- paste0(right_html,
          '<div class="pipeline-expiring">',
          '<div class="exp-name" style="color:',rcolor,'">',htmltools::htmlEscape(p_row$Player),
          ' <span style="font-size:.8em;color:#8b949e;">(',p_row$`Prim Pos`,')</span></div>',
          '<div class="exp-meta">Readiness: <b style="color:',rcolor,'">',p_row$Readiness,'</b> (',p_row$Readiness_Tier,') \u2022 ',
          'Dynasty: ',p_row$Dynasty_Score,' \u2022 ',score_display,' \u2022 Impact: ',p_row$Impact_Timeline,
          elc_display,'</div>',
          '</div>')
      }
    }
    right_html <- paste0(right_html, '</div>')

    # Gap analysis
    expiring_positions <- if(nrow(expiring) > 0) unique(expiring$`Prim Pos`) else character(0)
    gaps_html <- ""
    if(length(expiring_positions) > 0) {
      gaps <- c()
      for(pos in expiring_positions) {
        pos_prospects <- prospects %>% filter(`Prim Pos` == pos, Readiness >= 30)
        if(nrow(pos_prospects) == 0) {
          n_expiring_at_pos <- sum(expiring$`Prim Pos` == pos)
          gaps <- c(gaps, paste0(
            '<div class="pipeline-gap">',
            '<div class="gap-pos">',pos,' - POSITION GAP</div>',
            '<div class="gap-desc">',n_expiring_at_pos,' expiring contract(s) at ',pos,' with no developing or ready prospect replacement.</div>',
            '</div>'))
        }
      }
      if(length(gaps) > 0) {
        gaps_html <- paste0(
          '<div style="margin-top:18px;">',
          '<h4 style="color:#f85149;margin:0 0 12px;font-weight:700;">Position Gaps</h4>',
          paste0(gaps, collapse=""),
          '</div>')
      }
    }

    HTML(paste0('<div class="pipeline-card">',
      '<h4>Pipeline Analysis: ',htmltools::htmlEscape(ow),'</h4>',
      '<div style="display:flex;gap:20px;flex-wrap:wrap;">',
      left_html, right_html,
      '</div>',
      gaps_html,
      '</div>'))
  })

  # ═══════ TRADE VALUE BOARD ═══════
  tv_f <- reactive({
    df <- prospects_enriched()
    if(nrow(df)==0) return(df)
    if(input$tv_pos!="All") df <- df %>% filter(`Prim Pos`==input$tv_pos)
    if(input$tv_tier!="All") df <- df %>% filter(Dynasty_Tier==input$tv_tier)
    if(input$tv_owner!="All") df <- df %>% filter(Status==input$tv_owner)
    df %>% arrange(desc(Dynasty_Score))
  })

  output$tv_stats <- renderUI({
    df <- tv_f()
    if(nrow(df)==0) return(div(class="empty-state",
      div(class="empty-icon","\U0001F4B9"),
      div(class="empty-title","No prospects loaded"),
      div(class="empty-desc","Upload prospect data on the Prospect Roster tab to populate the trade value board.")))
    n_owners <- length(unique(df$Status[df$Status!="FA"]))
    avg_dyn <- round(mean(df$Dynasty_Score,na.rm=TRUE),1)
    top_score <- max(df$Dynasty_Score,na.rm=TRUE)
    n_star <- sum(df$Dynasty_Tier %in% c("Franchise","Star"),na.rm=TRUE)
    div(class="stat-bar",
      div(class="stat-box",div(class="num",nrow(df)),div(class="lbl","Total Prospects")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_owners),div(class="lbl","Owners")),
      div(class="stat-box",div(class="num",style="color:#ffd700",n_star),div(class="lbl","Star+")),
      div(class="stat-box",div(class="num",top_score),div(class="lbl","Top Score")),
      div(class="stat-box",div(class="num",avg_dyn),div(class="lbl","Avg Score")))
  })

  output$tv_table <- renderDT({
    df <- tv_f()
    if(nrow(df)==0) return(datatable(data.frame(Message="No prospects to display"),rownames=FALSE))
    df$Rank <- 1:nrow(df)
    display <- df %>%
      select(Rank,Player,`Prim Pos`,Age,Status,Team,Dynasty_Tier,Dynasty_Score,Readiness,Impact_Timeline,Grad_Timeline,Score,GP) %>%
      arrange(desc(Dynasty_Score))
    datatable(display, selection="none",rownames=FALSE,
      colnames=c("Rank","Player","Pos","Age","Owner","Team","Dynasty Tier","Dyn Score","Readiness","Impact","Graduation","Score","GP"),
      options=list(pageLength=50,scrollX=TRUE,dom='lftipr',order=list(list(0,'asc')),
        language=list(search="Search all prospects:"))) %>%
      formatStyle('Dynasty_Tier',
        color=styleEqual(c("Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","High Upside","Developing","Depth Prospect","Longshot"),
          c("#ffd700","#f0883e","#3fb950","#58a6ff","#8b949e","#6e7681","#a371f7","#58a6ff","#6e7681","#484f58")),fontWeight='bold') %>%
      formatStyle('Dynasty_Score',background=styleColorBar(c(0,max(df$Dynasty_Score,na.rm=TRUE)),'rgba(163,113,247,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('Readiness',background=styleColorBar(c(0,100),'rgba(63,185,80,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center')
  })

  output$tv_trade_result <- renderUI({
    req(input$tv_evaluate)
    isolate({
      df <- prospects_enriched()
      if(nrow(df)==0) return(NULL)

      side_a_names <- input$tv_side_a
      side_b_names <- input$tv_side_b

      if(is.null(side_a_names) || length(side_a_names)==0 || is.null(side_b_names) || length(side_b_names)==0) {
        return(HTML('<div class="trade-section"><h4>Trade Evaluator</h4><p style="color:#484f58;">Select players for both Side A and Side B, then click Evaluate Trade.</p></div>'))
      }

      side_a <- df %>% filter(Player %in% side_a_names)
      side_b <- df %>% filter(Player %in% side_b_names)

      total_a <- sum(side_a$Dynasty_Score, na.rm=TRUE)
      total_b <- sum(side_b$Dynasty_Score, na.rm=TRUE)

      make_trade_items <- function(side_df) {
        if(nrow(side_df)==0) return("")
        paste0(sapply(1:nrow(side_df), function(i) {
          r <- side_df[i,]
          dv_class <- paste0("dv-",tolower(gsub(" ","",r$Dynasty_Tier)))
          paste0('<div class="trade-player-item">',
            htmltools::htmlEscape(r$Player),' <span class="',dv_class,'">(',r$Dynasty_Tier,')</span>',
            ' <span style="float:right;color:#a371f7;font-weight:600;">',r$Dynasty_Score,'</span></div>')
        }), collapse="")
      }

      diff <- abs(total_a - total_b)
      pct_diff <- if(max(total_a,total_b)>0) round(diff / max(total_a,total_b) * 100, 0) else 0

      if(pct_diff <= 10) {
        verdict_class <- "trade-fair"
        verdict_text <- "FAIR TRADE - Dynasty values are within 10% of each other"
      } else if(pct_diff <= 25) {
        verdict_class <- "trade-unfair"
        winner <- if(total_a > total_b) "Side A" else "Side B"
        verdict_text <- paste0("SLIGHT EDGE - ",winner," wins by ",pct_diff,"% dynasty value")
      } else {
        verdict_class <- "trade-unfair"
        winner <- if(total_a > total_b) "Side A" else "Side B"
        verdict_text <- paste0("LOPSIDED - ",winner," wins by ",pct_diff,"% dynasty value")
      }

      HTML(paste0(
        '<div class="trade-section"><h4>Trade Evaluation</h4>',
        '<div style="display:flex;gap:16px;flex-wrap:wrap;">',
        '<div class="trade-side"><h5>Side A</h5>',
        make_trade_items(side_a),
        '<div class="trade-total" style="color:#a371f7;">Total Dynasty Value: ',round(total_a,1),'</div></div>',
        '<div class="trade-side"><h5>Side B</h5>',
        make_trade_items(side_b),
        '<div class="trade-total" style="color:#a371f7;">Total Dynasty Value: ',round(total_b,1),'</div></div>',
        '</div>',
        '<div class="trade-verdict ',verdict_class,'">',verdict_text,'</div>',
        '</div>'))
    })
  })

  # ═══════ 2026 DRAFT WITH DYNASTY PROJECTIONS ═══════
  draft_enriched <- reactive({
    df <- draft_raw()
    if(nrow(df)==0) return(df)
    df %>% rowwise() %>% mutate(
      dv = list(draft_dynasty_value(Rank, NHLe, Pos, League)),
      Ceiling = dv$ceiling,
      Make_Pct = dv$make_pct,
      Debut_Est = dv$debut_est,
      Dyn_Score = dv$dynasty_score,
      Yrs_To_NHL = dv$years_to_nhl
    ) %>% ungroup() %>% select(-dv) %>%
    mutate(
      # Expected dynasty score based on rank position (linear regression approximation)
      Expected_Dyn = round((95 * 0.4) + (35 * 1.2) + (max(0, 115 - Rank) * 0.15) - (Rank * 0.35), 1),
      Is_Value_Pick = Dyn_Score > Expected_Dyn
    )
  })

  dr_f <- reactive({
    df <- draft_enriched()
    if(nrow(df)==0) return(df)
    if(input$dr_pos=="Forward") df <- df %>% filter(grepl("^(LW|RW|C|LW/RW|C/LW|C/RW)$",Pos))
    if(input$dr_pos=="Defense") df <- df %>% filter(grepl("D",Pos))
    if(input$dr_pos=="Goalie") df <- df %>% filter(Pos=="G")
    if(input$dr_tier!="All") df <- df %>% filter(Fantasy_Tier==input$dr_tier)
    if(input$dr_league!="All") df <- df %>% filter(League==input$dr_league)
    if(input$dr_nat!="All") df <- df %>% filter(Nationality==input$dr_nat)
    if(input$dr_ceiling!="All") df <- df %>% filter(Ceiling==input$dr_ceiling)
    if(!is.null(input$dr_style) && input$dr_style!="All" && "Style" %in% names(df)) df <- df %>% filter(Style==input$dr_style)
    df
  })

  output$dr_stats <- renderUI({
    df <- dr_f()
    if(nrow(df)==0) return(div(class="empty-state",
      div(class="empty-icon","\U0001F4DD"),
      div(class="empty-title","No draft prospects loaded"),
      div(class="empty-desc","Upload a draft CSV to see 2026 draft prospect rankings and dynasty valuations.")))
    n_f <- sum(grepl("^(LW|RW|C|LW/RW|C/LW|C/RW)$",df$Pos))
    n_d <- sum(grepl("D",df$Pos))
    n_star <- sum(df$Ceiling %in% c("Franchise","Star"),na.rm=TRUE)
    avg_make <- round(mean(df$Make_Pct,na.rm=TRUE),0)
    avg_nhle <- round(mean(df$NHLe,na.rm=TRUE),1)
    n_value <- sum(df$Is_Value_Pick, na.rm=TRUE)
    div(class="stat-bar",
      div(class="stat-box",div(class="num",nrow(df)),div(class="lbl","Prospects")),
      div(class="stat-box",div(class="num",style="color:#f0883e",n_f),div(class="lbl","Forwards")),
      div(class="stat-box",div(class="num",style="color:#58a6ff",n_d),div(class="lbl","Defense")),
      div(class="stat-box",div(class="num",style="color:#ffd700",n_star),div(class="lbl","Star+ Ceiling")),
      div(class="stat-box",div(class="num",paste0(avg_make,"%")),div(class="lbl","Avg Make %")),
      div(class="stat-box",div(class="num",avg_nhle),div(class="lbl","Avg NHLe")),
      div(class="stat-box",div(class="num",style="color:#3fb950",n_value),div(class="lbl","Value Picks")))
  })

  output$dr_table <- renderDT({
    df <- dr_f()
    if(nrow(df)==0) return(datatable(data.frame(Message="No prospects match filters"),rownames=FALSE))
    has_style <- "Style" %in% names(df)
    display <- df %>%
      mutate(Value = ifelse(Is_Value_Pick, "VALUE", ""))
    if(has_style) {
      display <- display %>% select(Rank,Player,Pos,Nationality,League,Style,Ceiling,Make_Pct,Debut_Est,Dyn_Score,NHLe,Pts,GP,Size,Fantasy_Tier,Value)
    } else {
      display <- display %>% select(Rank,Player,Pos,Nationality,League,Ceiling,Make_Pct,Debut_Est,Dyn_Score,NHLe,Pts,GP,Size,Fantasy_Tier,Value)
    }
    col_names <- if(has_style) c("Rank","Player","Pos","Nat","League","Style","Ceiling","%Make","Debut","Dyn Score","NHLe","Pts","GP","Size","Tier","Value") else c("Rank","Player","Pos","Nat","League","Ceiling","%Make","Debut","Dyn Score","NHLe","Pts","GP","Size","Tier","Value")
    value_col <- if(has_style) 15 else 14
    datatable(display, selection="single",rownames=FALSE,
      colnames=col_names,
      options=list(pageLength=50,scrollX=TRUE,dom='lftipr',order=list(list(0,'asc')),
        language=list(search="Search draft prospects:"),
        rowCallback=JS(
          "function(row, data, displayNum, displayIndex, dataIndex) {",
          paste0("  if(data[",value_col,"] === 'VALUE') {"),
          "    $(row).addClass('draft-value-pick');",
          "  }",
          "}"
        ))) %>%
      formatStyle('Ceiling',
        color=styleEqual(c("Franchise","Star","Top Line","Middle Six","Bottom Six","Depth","Longshot"),
          c("#ffd700","#f0883e","#3fb950","#58a6ff","#8b949e","#6e7681","#484f58")),fontWeight='bold') %>%
      formatStyle('Fantasy_Tier',
        backgroundColor=styleEqual(c("Elite","Top 10","Rd 1","Rd 1-2","Rd 2","Rd 2-3","Rd 3","Late"),c("#3d2a0a","#1a3d1a","#1a2d4a","#1a2d4a","#21262d","#21262d","#1a1a1a","#0d1117")),
        color=styleEqual(c("Elite","Top 10","Rd 1","Rd 1-2","Rd 2","Rd 2-3","Rd 3","Late"),c("#f0883e","#3fb950","#58a6ff","#58a6ff","#8b949e","#8b949e","#6e7681","#484f58")),fontWeight='bold') %>%
      formatStyle('Make_Pct',background=styleColorBar(c(0,100),'rgba(63,185,80,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('Dyn_Score',background=styleColorBar(c(0,max(df$Dyn_Score,na.rm=TRUE)),'rgba(163,113,247,0.2)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('NHLe',background=styleColorBar(c(0,max(df$NHLe,na.rm=TRUE)),'rgba(240,136,62,0.15)'),backgroundSize='98% 70%',backgroundRepeat='no-repeat',backgroundPosition='center') %>%
      formatStyle('Value',color=styleEqual(c("VALUE",""),c("#3fb950","#0d1117")),fontWeight='bold') %>%
      {if(has_style) formatStyle(., 'Style',
        color=styleEqual(
          c("Elite Playmaker","Playmaker","Sniper","Power Forward","Skilled Winger","Two-Way C","Two-Way F","Offensive D","Two-Way D","Defensive D","Starting G Upside","Backup G"),
          c("#ffd700","#a371f7","#f85149","#f0883e","#3fb950","#58a6ff","#58a6ff","#79c0ff","#8b949e","#6e7681","#3fb950","#484f58")),
        fontWeight='bold') else .}
  })

  output$dr_card <- renderUI({
    sel <- input$dr_table_rows_selected; if(is.null(sel)) return(NULL)
    r <- (dr_f())[sel,]
    enc <- URLencode(r$Player,reserved=TRUE); nq <- URLencode(paste(r$Player,"hockey news"),reserved=TRUE)
    pq <- URLencode(paste(r$Player,"prospect scouting 2026"),reserved=TRUE); xq <- URLencode(paste(r$Player,"hockey"),reserved=TRUE)
    dv_class <- paste0("dv-",tolower(gsub(" ","",r$Ceiling)))

    value_badge <- ""
    if(!is.na(r$Is_Value_Pick) && r$Is_Value_Pick) {
      value_badge <- ' <span class="value-badge">VALUE PICK</span>'
    }

    # Dynasty value cards
    val_html <- paste0(
      '<div style="display:flex;gap:12px;margin:10px 0;flex-wrap:wrap;">',
      '<div class="val-card" style="flex:1;min-width:130px;"><div class="val-label">Ceiling</div><div class="val-value ',dv_class,'">',r$Ceiling,'</div></div>',
      '<div class="val-card" style="flex:1;min-width:130px;"><div class="val-label">Dynasty Score</div><div class="val-value" style="color:#a371f7;">',r$Dyn_Score,'</div></div>',
      '<div class="val-card" style="flex:1;min-width:130px;"><div class="val-label">NHL Probability</div><div class="val-value" style="color:#3fb950;">',r$Make_Pct,'%</div></div>',
      '<div class="val-card" style="flex:1;min-width:130px;"><div class="val-label">Est. Debut</div><div class="val-value" style="color:#58a6ff;">',r$Debut_Est,'</div></div>',
      '<div class="val-card" style="flex:1;min-width:130px;"><div class="val-label">NHLe</div><div class="val-value" style="color:#f0883e;">',r$NHLe,'</div></div>',
      '</div>')

    # Fantasy profile section (new)
    fantasy_html <- ""
    has_style_col <- "Style" %in% names(r) && !is.na(r$Style) && nchar(r$Style) > 0
    has_cats_col  <- "Fantasy_Cats" %in% names(r) && !is.na(r$Fantasy_Cats) && nchar(r$Fantasy_Cats) > 0
    has_note_col  <- "Scouting_Note" %in% names(r) && !is.na(r$Scouting_Note) && nchar(r$Scouting_Note) > 0
    if(has_style_col || has_cats_col || has_note_col) {
      style_color <- switch(r$Style,
        "Elite Playmaker"="#ffd700","Playmaker"="#a371f7","Sniper"="#f85149",
        "Power Forward"="#f0883e","Skilled Winger"="#3fb950","Two-Way C"="#58a6ff",
        "Two-Way F"="#58a6ff","Offensive D"="#79c0ff","Two-Way D"="#8b949e",
        "Defensive D"="#6e7681","Starting G Upside"="#3fb950","Backup G"="#484f58","#8b949e")
      style_badge <- if(has_style_col) paste0('<span style="background:',style_color,'22;border:1px solid ',style_color,';color:',style_color,';padding:3px 10px;border-radius:12px;font-size:.82em;font-weight:700;">',r$Style,'</span>') else ""

      # Category chips
      cat_chips <- ""
      if(has_cats_col) {
        cats <- strsplit(r$Fantasy_Cats, ",\\s*")[[1]]
        cat_color_map <- c("G"="#f85149","A"="#58a6ff","2G+A"="#a371f7","PIM"="#f0883e","SOG"="#ffd700","Hit"="#e57373","Blk"="#4caf50","TK/GV"="#26c6da","Cor"="#9e9e9e","W"="#3fb950","SV%"="#79c0ff","SHO"="#ffd700","GAA"="#8b949e")
        chips <- sapply(cats, function(cat) {
          cat <- trimws(cat)
          col <- if(cat %in% names(cat_color_map)) cat_color_map[cat] else "#8b949e"
          paste0('<span style="background:',col,'22;border:1px solid ',col,';color:',col,';padding:2px 8px;border-radius:10px;font-size:.78em;font-weight:700;margin:2px;">',cat,'</span>')
        })
        cat_chips <- paste0('<div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:4px;">',paste(chips,collapse=""),'</div>')
      }

      scouting_box <- if(has_note_col) paste0(
        '<div style="margin:8px 0;padding:10px 14px;background:#0d1117;border-left:3px solid ',style_color,';border-radius:0 6px 6px 0;font-size:.85em;color:#c9d1d9;line-height:1.5;">',
        '<b style="color:',style_color,';">\U0001F3AF Fantasy Profile</b><br>',
        htmltools::htmlEscape(r$Scouting_Note),'</div>') else ""

      scoring_legend <- paste0(
        '<div style="margin:6px 0;padding:6px 10px;background:#161b22;border:1px solid #21262d;border-radius:6px;font-size:.75em;color:#8b949e;">',
        '<b>Scoring cats:</b> G=Goals \u2022 A=Assists \u2022 2G+A=Multi-pt \u2022 SOG=Shots \u2022 Hit=Hits \u2022 Blk=Blocks \u2022 PIM=Penalties \u2022 TK/GV=Takeaways \u2022 Cor=Corsi</div>')

      fantasy_html <- paste0(
        '<div style="margin:10px 0;padding:12px;background:#161b22;border:1px solid #30363d;border-radius:8px;">',
        '<div style="font-size:.8em;color:#8b949e;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Fantasy Profile</div>',
        style_badge, cat_chips, scouting_box, scoring_legend, '</div>')
    }

    nhle_analysis <- ""
    if(!is.na(r$NHLe)){
      nhle_class <- case_when(r$NHLe>=35~"Likely star",r$NHLe>=30~"Strong prospect",r$NHLe>=20~"Solid prospect",r$NHLe>=12~"Developmental",TRUE~"High bust risk")
      nhle_color <- case_when(r$NHLe>=35~"#ffd700",r$NHLe>=30~"#3fb950",r$NHLe>=20~"#58a6ff",r$NHLe>=12~"#8b949e",TRUE~"#f85149")
      nhle_analysis <- paste0('<div style="margin:6px 0;padding:8px 12px;background:#0d1117;border:1px solid #21262d;border-radius:6px;font-size:.85em;">',
        'NHLe Assessment: <b style="color:',nhle_color,'">',nhle_class,'</b>',
        ' \u2022 ~',round(r$Yrs_To_NHL,1),' years to NHL from ',r$League,'</div>')
    }

    ppg <- if(!is.na(r$GP)&&r$GP>0) paste0(" \u2022 ",round(r$Pts/r$GP,2)," PPG") else ""

    HTML(paste0('<div class="player-card"><h3>',htmltools::htmlEscape(r$Player),' <span class="badge-prospect">#',r$Rank,'</span>',value_badge,'</h3>',
      '<div class="meta">',r$Pos,' \u2022 ',r$Nationality,' \u2022 ',r$Size,' \u2022 <b style="color:#f0883e">',r$Fantasy_Tier,'</b></div>',
      '<div class="meta">',r$League,' \u2022 ',r$Pts,' pts (',r$G,'G, ',r$A,'A) in ',r$GP,' GP',ppg,'</div>',
      val_html, fantasy_html, nhle_analysis,
      '<div class="link-section"><h4>\u2B50 Scouting</h4>',
        make_btn("Elite Prospects",paste0("https://www.eliteprospects.com/search/player?q=",enc),"dr"),
        make_btn("Scouting Reports",paste0("https://www.google.com/search?q=",pq),"dr"),
        make_btn("Draft Profile",paste0("https://www.google.com/search?q=",URLencode(paste(r$Player,"NHL draft 2026 profile"),reserved=TRUE)),"dr"),
        make_btn("Dobber",paste0("https://dobberprospects.com/search/?s=",enc),"dr"),
        make_btn("Highlights",paste0("https://www.youtube.com/results?search_query=",URLencode(paste(r$Player,"hockey highlights"),reserved=TRUE)),"dr"),'</div>',
      '<div class="link-section"><h4>\U0001F4F0 Coverage</h4>',
        make_btn("Google News",paste0("https://news.google.com/search?q=",nq),"dr"),
        make_btn("Hockey Writers",paste0("https://www.google.com/search?q=",URLencode(paste(r$Player,"2026 draft site:thehockeywriters.com"),reserved=TRUE)),"dr"),
        make_btn("Draft Prospects Hockey",paste0("https://www.google.com/search?q=",URLencode(paste(r$Player,"site:draftprospectshockey.com"),reserved=TRUE)),"dr"),'</div>',
      '<div class="link-section"><h4>\U0001F4AC Social</h4>',
        make_btn("X/Twitter",paste0("https://x.com/search?q=",xq,"&f=live"),"dr"),
        make_btn("Reddit",paste0("https://www.reddit.com/search/?q=",nq,"&sort=new"),"dr"),
        make_btn("YouTube",paste0("https://www.youtube.com/results?search_query=",nq),"dr"),'</div></div>'))
  })
  observeEvent(input$dr_open_url,{browser_url$dr<-input$dr_open_url})
  output$dr_browser <- renderUI({render_browser(browser_url$dr)})
}
shinyApp(ui, server)
