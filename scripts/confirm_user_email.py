import os
import socket
import sys

import psycopg2

EMAIL = sys.argv[1] if len(sys.argv) > 1 else "1178541066@qq.com"
PASSWORD = os.environ.get("SUPABASE_DB_PASSWORD", "CDAzkP9Cy7rqLAsY")
PROJECT_REF = "hxgdjzpjcmzgsojhhoio"


def connect():
    host = f"db.{PROJECT_REF}.supabase.co"
    try:
        return psycopg2.connect(
            host=host,
            port=5432,
            dbname="postgres",
            user="postgres",
            password=PASSWORD,
            sslmode="require",
        )
    except Exception:
        ipv6_hosts = [
            "2406:da14:1d62:b400:6fc4:ce08:e268:8f6",
        ]
        for ipv6 in ipv6_hosts:
            try:
                return psycopg2.connect(
                    host=ipv6,
                    port=5432,
                    dbname="postgres",
                    user="postgres",
                    password=PASSWORD,
                    sslmode="require",
                )
            except Exception:
                continue
        infos = socket.getaddrinfo(host, 5432, proto=socket.IPPROTO_TCP)
        return psycopg2.connect(
            host=infos[0][4][0],
            port=5432,
            dbname="postgres",
            user="postgres",
            password=PASSWORD,
            sslmode="require",
        )


conn = connect()
conn.autocommit = True
cur = conn.cursor()
cur.execute(
    """
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where email = %s
    """,
    (EMAIL,),
)
print("confirmed rows:", cur.rowcount)
cur.execute(
    "select email, email_confirmed_at from auth.users where email = %s",
    (EMAIL,),
)
print(cur.fetchone())
conn.close()
