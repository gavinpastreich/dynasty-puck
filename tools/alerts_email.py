#!/usr/bin/env python3
"""Email side of the opt-in alerts (run by .github/workflows/alerts.yml after tools/alerts.js).

Uses a Gmail account made just for the league (config alerts.emailAddress) and a Gmail *app password* stored as the
repository secret DP_EMAIL_APP_PASSWORD. Nothing personal is needed and nobody's address is ever published:
  - GMs sign up by emailing that address with "subscribe" in the subject (the site's Alerts page opens a ready-made
    email) and leave with "unsubscribe". The mailbox itself is the list; this script re-reads it every run.
  - New sign-ups get a short welcome email.
  - When tools/alerts.js wrote a weekly digest (tools/out/digest.*), it goes out to everyone on the list (BCC).
Does nothing (and exits 0) until the address and the secret are both set.
"""
import email
import email.utils
import imaplib
import json
import os
import smtplib
import sys
from email.header import decode_header, make_header
from email.message import EmailMessage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, "config", "league.json"), encoding="utf-8"))
A = CFG.get("alerts", {})
ADDR = (A.get("emailAddress") or "").strip()
PW = os.environ.get("DP_EMAIL_APP_PASSWORD", "").strip()
OUT = os.path.join(ROOT, "tools", "out")
SITE = A.get("siteUrl", "")


def subject_of(msg):
    try:
        return str(make_header(decode_header(msg.get("Subject", ""))))
    except Exception:
        return msg.get("Subject", "")


def read_list(imap):
    """Replay subscribe/unsubscribe emails oldest-first. Returns (subscribers, new sign-ups since the last run)."""
    imap.select("INBOX")
    typ, data = imap.search(None, '(OR SUBJECT "subscribe" SUBJECT "unsubscribe")')
    ids = data[0].split() if typ == "OK" and data and data[0] else []
    subs, new = {}, []
    for i in ids:
        typ, parts = imap.fetch(i, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
        if typ != "OK":
            continue
        flags = parts[0][0].decode(errors="ignore")
        msg = email.message_from_bytes(parts[0][1])
        who = email.utils.parseaddr(msg.get("From", ""))[1].lower()
        subj = subject_of(msg).lower()
        if not who or who == ADDR.lower():
            continue
        if "unsubscribe" in subj:
            subs.pop(who, None)
        elif "subscribe" in subj:
            team = subj.split("subscribe", 1)[1].strip(" :-") if "subscribe" in subj else ""
            subs[who] = team
            if "\\Seen" not in flags:
                new.append(who)
        imap.store(i, "+FLAGS", "\\Seen")
    return subs, [w for w in new if w in subs]


def send(smtp, to_list, subject, text, html=None, bcc=True):
    msg = EmailMessage()
    msg["From"] = email.utils.formataddr(("Dynasty Puck HQ", ADDR))
    msg["To"] = ADDR if bcc else ", ".join(to_list)
    msg["Subject"] = subject
    msg["List-Unsubscribe"] = f"<mailto:{ADDR}?subject=unsubscribe>"
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    smtp.send_message(msg, from_addr=ADDR, to_addrs=to_list if bcc else None)


def main():
    if not ADDR or not PW:
        print("email alerts: not set up (config alerts.emailAddress + secret DP_EMAIL_APP_PASSWORD); skipping")
        return
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(ADDR, PW)
    subs, new = read_list(imap)
    imap.logout()
    print(f"email alerts: {len(subs)} subscribers, {len(new)} new")
    digest = os.path.join(OUT, "digest.txt")
    if not new and not os.path.exists(digest):
        return
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(ADDR, PW)
        for who in new:
            send(smtp, [who], "You're on the Dynasty Puck HQ list",
                 f"Thanks! You'll get the weekly Dynasty Puck digest every Monday morning: matchups, lineup watch, "
                 f"standings, graduations and roster moves.\n\n{SITE}\n\nTo stop, reply with 'unsubscribe'.", bcc=False)
        if os.path.exists(digest) and subs:
            text = open(digest, encoding="utf-8").read()
            html = open(os.path.join(OUT, "digest.html"), encoding="utf-8").read()
            subject = open(os.path.join(OUT, "subject.txt"), encoding="utf-8").read().strip()
            send(smtp, sorted(subs), subject, text, html)
            print(f"weekly digest sent to {len(subs)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never fail the whole alerts job over email
        print("email alerts failed:", e, file=sys.stderr)
