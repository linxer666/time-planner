"""一次性执行 Supabase 建表脚本。用法：
set SUPABASE_DB_PASSWORD=你的数据库密码
python scripts/run_supabase_sql.py
"""
import os
import sys
from pathlib import Path

import psycopg2

PROJECT_REF = "hxgdjzpjcmzgsojhhoio"
DB_PASSWORD = os.environ.get("SUPABASE_DB_PASSWORD", "")
BASE = Path(__file__).resolve().parent.parent

CONN_CANDIDATES = [
    (
        f"host=db.{PROJECT_REF}.supabase.co "
        f"port=5432 dbname=postgres user=postgres "
        f"password={DB_PASSWORD} sslmode=require"
    ),
]


def connect():
    if not DB_PASSWORD:
        raise SystemExit("请设置环境变量 SUPABASE_DB_PASSWORD")
    last_err = None
    for conn_str in CONN_CANDIDATES:
        try:
            return psycopg2.connect(conn_str)
        except Exception as err:
            last_err = err
    # Windows 部分环境无法解析 db.* 域名，回退 IPv6
    try:
        import socket
        infos = socket.getaddrinfo(f"db.{PROJECT_REF}.supabase.co", 5432, proto=socket.IPPROTO_TCP)
        for info in infos:
            host = info[4][0]
            conn = psycopg2.connect(
                host=host,
                port=5432,
                dbname="postgres",
                user="postgres",
                password=DB_PASSWORD,
                sslmode="require",
            )
            print("Connected via:", host)
            return conn
    except Exception as err:
        last_err = err
    raise last_err


def run_file(path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    print(f"=== Running {path.name} ===")
    conn = connect()
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print(f"OK: {path.name}")
    finally:
        conn.close()


def verify() -> None:
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                select table_name
                from information_schema.tables
                where table_schema = 'public' and table_type = 'BASE TABLE'
                order by table_name
                """
            )
            tables = [row[0] for row in cur.fetchall()]
            print("Tables:", ", ".join(tables))
            cur.execute(
                "select id, name, public from storage.buckets where id = 'materials'"
            )
            print("Storage bucket:", cur.fetchone())
    finally:
        conn.close()


if __name__ == "__main__":
    for name in ("supabase-schema.sql", "supabase-storage.sql"):
        run_file(BASE / name)
    verify()
    print("Done.")
