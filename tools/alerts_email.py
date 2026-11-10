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


def already_emailed(subject):
    """True if a message with this subject is in the mailbox's Sent folder from the last 6 days, None if that can't
    be checked. The alerts job runs at irregular times, so this is what keeps a weekly digest from going out twice."""
    import datetime as dt
    try:
        imap = imaplib.IMAP4_SSL("imap.gmail.com")
        imap.login(ADDR, PW)
        try:
            typ, _ = imap.select('"[Gmail]/Sent Mail"', readonly=True)
            if typ != "OK":
                return None
            since = (dt.date.today() - dt.timedelta(days=6)).strftime("%d-%b-%Y")
            key = subject.encode("ascii", "ignore").decode().replace('"', "").strip()
            typ, data = imap.search(None, "SINCE", since, "SUBJECT", '"' + key + '"')
            if typ != "OK":
                return None
            return bool(data and data[0] and data[0].split())
        finally:
            try:
                imap.logout()
            except Exception:
                pass
    except Exception as e:
        print("email alerts: could not check the Sent folder:", e)
        return None


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
        if os.environ.get("DP_ALERTS_MODE") == "emailtest":
            sys.exit("email test: the address or the DP_EMAIL_APP_PASSWORD secret is missing")
        return
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(ADDR, PW)
    print("email alerts: signed in to", ADDR)
    subs, new = read_list(imap)
    imap.logout()
    print(f"email alerts: {len(subs)} subscribers, {len(new)} new")
    if os.environ.get("DP_ALERTS_MODE") == "emailtest":  # send this week's digest to the league inbox only
        digest = os.path.join(OUT, "digest.txt")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(ADDR, PW)
            text = open(digest, encoding="utf-8").read() if os.path.exists(digest) else "Test from Dynasty Puck HQ."
            html = open(os.path.join(OUT, "digest.html"), encoding="utf-8").read() if os.path.exists(digest) else None
            subject = open(os.path.join(OUT, "subject.txt"), encoding="utf-8").read().strip() if os.path.exists(digest) else "Dynasty Puck HQ"
            send(smtp, [ADDR], "[Test] " + subject, text, html, bcc=False)
        print(f"email alerts: TEST digest sent to {ADDR} only ({len(subs)} subscribers were not emailed)")
        return
    digest = os.path.join(OUT, "digest.txt")
    if not new and not os.path.exists(digest):
        return
    go = False
    if os.path.exists(digest) and subs:
        subject = open(os.path.join(OUT, "subject.txt"), encoding="utf-8").read().strip()
        seen = already_emailed(subject)
        exact = os.path.exists(os.path.join(OUT, "exact.txt")) and open(os.path.join(OUT, "exact.txt")).read().strip() == "yes"
        # can't check the Sent folder -> only send in the exact digest hour (the old behaviour), never twice
        go = (seen is False) or (seen is None and exact)
        if not go:
            print("email alerts: this week's digest already went out" if seen else "email alerts: Sent folder unreadable and not the digest hour; not sending")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(ADDR, PW)
        for who in new:
            send(smtp, [who], "You're on the Dynasty Puck HQ list",
                 f"Thanks! You'll get the weekly Dynasty Puck digest every Monday morning: matchups, lineup watch, "
                 f"standings, graduations and roster moves.\n\n{SITE}\n\nTo stop, reply with 'unsubscribe'.", bcc=False)
        if go:
            text = open(digest, encoding="utf-8").read()
            html = open(os.path.join(OUT, "digest.html"), encoding="utf-8").read()
            send(smtp, sorted(subs), subject, text, html)
            print(f"weekly digest sent to {len(subs)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never fail the whole alerts job over email (but a test run should show red)
        print("email alerts failed:", e, file=sys.stderr)
        if os.environ.get("DP_ALERTS_MODE") == "emailtest":
            sys.exit(1)
