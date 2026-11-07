import { formatMoney } from './lib/format';

test('formats money with two decimals', () => {
  expect(formatMoney(12.5, 'USD')).toContain('12.50');
});
