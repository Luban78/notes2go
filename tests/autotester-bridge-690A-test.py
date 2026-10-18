#!/usr/bin/env python3
"""690A local tests. No server, network, Docker or real credentials needed."""
import importlib.util
import json
import os
import pathlib
import tempfile
import threading
import time
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from unittest import mock

path = pathlib.Path(__file__).resolve().parent.parent / 'server' / 'autotester-apk' / 'bridge.py'
spec = importlib.util.spec_from_file_location('testbridge690A', path)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class TestBridge(unittest.TestCase):
    def setUp(self):
        bridge.current = None

    def test_no_bearer_refused(self):
        with mock.patch.object(bridge, 'read_env_key', side_effect=AssertionError('Should not read env')):
            self.assertEqual(bridge.is_admin('')[0], False)
            self.assertEqual(bridge.is_admin('Bearer test')[0], False)

    def test_control_point_closed(self):
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / 'control.json'
            f.write_text('{"active_backend":"cloud","mode":"NORMAL"}')
            with mock.patch.object(bridge, 'CONTROL', f):
                ok, reason = bridge.is_admin('Bearer ' + 'A' * 80)
                self.assertFalse(ok)
                self.assertEqual(reason, 'server_not_active_normal_backend')

    def test_admin_validated_at_server(self):
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / 'control.json'
            f.write_text('{"active_backend":"lubaserver","mode":"NORMAL"}')
            class Fake:
                status=200
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def read(self,n):return b'true'
            with mock.patch.object(bridge,'CONTROL',f), mock.patch.object(bridge,'read_env_key',return_value='public-anon-key'), mock.patch.object(bridge.urllib.request,'urlopen',return_value=Fake()) as http:
                self.assertEqual(bridge.is_admin('Bearer ' + 'X' * 80), (True,'ok'))
                self.assertEqual(http.call_count,1)

    def test_fixed_suites_and_independent_fail(self):
        root=pathlib.Path(__file__).resolve().parent.parent
        with mock.patch.object(bridge,'ROOT',root),mock.patch.object(bridge,'execute_job') as runner:
            runner.side_effect=[(0,'ISOLATION=PASS\nRESULT: DB_LAB_PASS=12 / ROLLBACK=PASS / NOT production RPC'),
                                (1,'ISOLATION=PASS\nERROR: failed')]
            bridge.current={'id':'abc','state':'running','started_utc':'now','finished_utc':None,'results':[]}
            bridge.run_job('abc')
            row=bridge.job_status()
            self.assertEqual(row['results'][0]['status'],'DB_PASS')
            self.assertEqual(row['results'][1]['status'],'DB_FAIL')
            self.assertEqual(row['state'],'completed')
            self.assertNotIn('ERROR: failed',json.dumps(row))

    def test_fake_pass_not_accepted_without_isolation(self):
        root=pathlib.Path(__file__).resolve().parent.parent
        with mock.patch.object(bridge,'ROOT',root),mock.patch.object(bridge,'execute_job',return_value=(0,'RESULT: REAL_RPC_BODY_PASS=22 / ROLLBACK=PASS')):
            bridge.current={'id':'abc','state':'running','started_utc':'now','finished_utc':None,'results':[]}
            bridge.run_job('abc')
            self.assertTrue(all(x['status']=='DB_FAIL' for x in bridge.job_status()['results']))

    def test_parallel_start_denied(self):
        start=threading.Event()
        release=threading.Event()
        def fake_run(job_id):
            start.set()
            release.wait(1)
            with bridge.lock:
                bridge.current['state']='completed'
                bridge.current['finished_monotonic']=time.monotonic()
        with mock.patch.object(bridge,'run_job',side_effect=fake_run):
            code, reply=bridge.start_job()
            self.assertEqual(code,202)
            self.assertTrue(start.wait(1))
            code, _=bridge.start_job()
            self.assertEqual(code,409)
            release.set()
            time.sleep(.03)
            code, _=bridge.start_job()
            self.assertEqual(code,429)

    def test_http_requires_admin(self):
        with ThreadingHTTPServer(('127.0.0.1',0),bridge.Handler) as server:
            t=threading.Thread(target=server.serve_forever,daemon=True)
            t.start()
            host, port=server.server_address
            c=HTTPConnection(host,port,timeout=3)
            c.request('GET','/autotester/v1/status')
            r=c.getresponse()
            self.assertEqual(r.status,403)
            self.assertEqual(json.loads(r.read())['ok'],False)
            c.close()
            server.shutdown()

    def test_invalid_origin_denied(self):
        with ThreadingHTTPServer(('127.0.0.1',0),bridge.Handler) as server:
            t=threading.Thread(target=server.serve_forever,daemon=True)
            t.start()
            host, port=server.server_address
            c=HTTPConnection(host,port,timeout=3)
            c.request('OPTIONS','/autotester/v1/start',headers={'Origin':'https://evil.test','Access-Control-Request-Headers':'authorization'})
            r=c.getresponse()
            self.assertEqual(r.status,403)
            self.assertIsNone(r.getheader('Access-Control-Allow-Origin'))
            r.read();c.close();server.shutdown()


if __name__=='__main__':unittest.main(verbosity=2)
