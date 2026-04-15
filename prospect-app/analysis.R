options(width = 200)

# ---- FILE 74: Skaters ----
cat(paste(rep("=", 80), collapse=""), "\n")
cat("FILE 74: SKATER PROSPECT ANALYSIS (MNR Contracts)\n")
cat(paste(rep("=", 80), collapse=""), "\n\n")

df74 <- read.csv("C:/Users/gavin/Downloads/files/dynasty-puck-prospect-app/prospect-app/Fantrax-Players-Dynasty_Puck__74_.csv",
                  stringsAsFactors = FALSE)

# Filter MNR contracts
mnr <- df74[df74$Contract == "MNR", ]
cat("Total MNR skater prospects:", nrow(mnr), "\n\n")

# --- MNR prospects per owner ---
cat("--- MNR Prospects Per Owner ---\n")
owner_counts <- sort(table(mnr$Status), decreasing = TRUE)
for (i in seq_along(owner_counts)) {
  cat(sprintf("  %-25s %d\n", names(owner_counts)[i], owner_counts[i]))
}
cat("\n")

# --- Age distribution ---
cat("--- Age Distribution of MNR Prospects ---\n")
age_counts <- sort(table(mnr$Age))
for (i in seq_along(age_counts)) {
  cat(sprintf("  Age %-3s: %d\n", names(age_counts)[i], age_counts[i]))
}
cat(sprintf("\n  Mean age: %.1f\n", mean(mnr$Age, na.rm=TRUE)))
cat(sprintf("  Median age: %.0f\n", median(mnr$Age, na.rm=TRUE)))
cat(sprintf("  Min age: %d | Max age: %d\n\n", min(mnr$Age, na.rm=TRUE), max(mnr$Age, na.rm=TRUE)))

# --- Score ranges: NHL GP vs no GP ---
# Convert Score to numeric (handle commas if any)
mnr$Score_num <- as.numeric(gsub(",", "", mnr$Score))
mnr$GP_num <- as.numeric(gsub(",", "", mnr$GP))

has_gp <- mnr[!is.na(mnr$GP_num) & mnr$GP_num > 0, ]
no_gp <- mnr[is.na(mnr$GP_num) | mnr$GP_num == 0, ]

cat("--- Score Ranges: MNR Prospects WITH NHL GP ---\n")
cat(sprintf("  Count: %d\n", nrow(has_gp)))
if (nrow(has_gp) > 0) {
  cat(sprintf("  Min Score: %.2f\n", min(has_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Max Score: %.2f\n", max(has_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Mean Score: %.2f\n", mean(has_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Median Score: %.2f\n", median(has_gp$Score_num, na.rm=TRUE)))
}
cat("\n")

cat("--- Score Ranges: MNR Prospects WITHOUT NHL GP ---\n")
cat(sprintf("  Count: %d\n", nrow(no_gp)))
if (nrow(no_gp) > 0) {
  cat(sprintf("  Min Score: %.2f\n", min(no_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Max Score: %.2f\n", max(no_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Mean Score: %.2f\n", mean(no_gp$Score_num, na.rm=TRUE)))
  cat(sprintf("  Median Score: %.2f\n", median(no_gp$Score_num, na.rm=TRUE)))
}
cat("\n")

# --- Top 30 MNR prospects by score ---
cat("--- Top 30 MNR Skater Prospects by Score ---\n")
mnr_sorted <- mnr[order(-mnr$Score_num), ]
top30 <- head(mnr_sorted, 30)
cat(sprintf("  %-4s %-30s %-5s %-6s %-5s %-20s %-6s\n", "Rank", "Player", "Age", "Score", "Pos", "Status", "GP"))
for (i in 1:nrow(top30)) {
  cat(sprintf("  %-4d %-30s %-5s %-6s %-5s %-20s %-6s\n",
              i, top30$Player[i], top30$Age[i], top30$Score[i],
              top30$Position[i], top30$Status[i], top30$GP[i]))
}
cat("\n")

# ---- FILE 75: Goalies ----
cat(paste(rep("=", 80), collapse=""), "\n")
cat("FILE 75: GOALIE PROSPECT ANALYSIS (MNR Contracts)\n")
cat(paste(rep("=", 80), collapse=""), "\n\n")

df75 <- read.csv("C:/Users/gavin/Downloads/files/dynasty-puck-prospect-app/prospect-app/Fantrax-Players-Dynasty_Puck__75_.csv",
                  stringsAsFactors = FALSE)

mnr_g <- df75[df75$Contract == "MNR", ]
cat("Total MNR goalie prospects:", nrow(mnr_g), "\n\n")

# --- MNR goalies per owner ---
cat("--- MNR Goalies Per Owner ---\n")
owner_counts_g <- sort(table(mnr_g$Status), decreasing = TRUE)
for (i in seq_along(owner_counts_g)) {
  cat(sprintf("  %-25s %d\n", names(owner_counts_g)[i], owner_counts_g[i]))
}
cat("\n")

# --- Age distribution ---
cat("--- Age Distribution of MNR Goalies ---\n")
age_counts_g <- sort(table(mnr_g$Age))
for (i in seq_along(age_counts_g)) {
  cat(sprintf("  Age %-3s: %d\n", names(age_counts_g)[i], age_counts_g[i]))
}
cat(sprintf("\n  Mean age: %.1f\n", mean(mnr_g$Age, na.rm=TRUE)))
cat(sprintf("  Median age: %.0f\n", median(mnr_g$Age, na.rm=TRUE)))
cat(sprintf("  Min age: %d | Max age: %d\n\n", min(mnr_g$Age, na.rm=TRUE), max(mnr_g$Age, na.rm=TRUE)))

# --- Score ranges ---
mnr_g$Score_num <- as.numeric(gsub(",", "", mnr_g$Score))
mnr_g$GP_num <- as.numeric(gsub(",", "", mnr_g$GP))

has_gp_g <- mnr_g[!is.na(mnr_g$GP_num) & mnr_g$GP_num > 0, ]
no_gp_g <- mnr_g[is.na(mnr_g$GP_num) | mnr_g$GP_num == 0, ]

cat("--- Score Ranges: MNR Goalies WITH NHL GP ---\n")
cat(sprintf("  Count: %d\n", nrow(has_gp_g)))
if (nrow(has_gp_g) > 0) {
  cat(sprintf("  Min Score: %.2f\n", min(has_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Max Score: %.2f\n", max(has_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Mean Score: %.2f\n", mean(has_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Median Score: %.2f\n", median(has_gp_g$Score_num, na.rm=TRUE)))
}
cat("\n")

cat("--- Score Ranges: MNR Goalies WITHOUT NHL GP ---\n")
cat(sprintf("  Count: %d\n", nrow(no_gp_g)))
if (nrow(no_gp_g) > 0) {
  cat(sprintf("  Min Score: %.2f\n", min(no_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Max Score: %.2f\n", max(no_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Mean Score: %.2f\n", mean(no_gp_g$Score_num, na.rm=TRUE)))
  cat(sprintf("  Median Score: %.2f\n", median(no_gp_g$Score_num, na.rm=TRUE)))
}
cat("\n")

# --- Top 30 MNR goalies by score ---
cat("--- Top 30 MNR Goalie Prospects by Score ---\n")
mnr_g_sorted <- mnr_g[order(-mnr_g$Score_num), ]
top30_g <- head(mnr_g_sorted, min(30, nrow(mnr_g_sorted)))
cat(sprintf("  %-4s %-30s %-5s %-6s %-5s %-20s %-6s\n", "Rank", "Player", "Age", "Score", "Pos", "Status", "GP"))
for (i in 1:nrow(top30_g)) {
  cat(sprintf("  %-4d %-30s %-5s %-6s %-5s %-20s %-6s\n",
              i, top30_g$Player[i], top30_g$Age[i], top30_g$Score[i],
              top30_g$Position[i], top30_g$Status[i], top30_g$GP[i]))
}
cat("\n")

# ---- FILE: 2026 Draft ----
cat(paste(rep("=", 80), collapse=""), "\n")
cat("2026 DRAFT: TOP 20 PROSPECTS (ALL COLUMNS)\n")
cat(paste(rep("=", 80), collapse=""), "\n\n")

draft <- read.csv("C:/Users/gavin/Downloads/files/dynasty-puck-prospect-app/prospect-app/draft_2026.csv",
                   stringsAsFactors = FALSE)

top20_draft <- head(draft, 20)
for (i in 1:nrow(top20_draft)) {
  cat(sprintf("--- #%d ---\n", i))
  for (col in names(top20_draft)) {
    cat(sprintf("  %-15s: %s\n", col, as.character(top20_draft[i, col])))
  }
  cat("\n")
}
