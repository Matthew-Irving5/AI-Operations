import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 5 },
    { duration: '15s', target: 10 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';

export default function () {
  const response = http.get(`${baseUrl}/login`);
  check(response, {
    'login responds successfully': (result) => result.status === 200,
    'login identifies AI Operations': (result) => result.body.includes('AI Operations'),
  });
  sleep(0.2);
}
