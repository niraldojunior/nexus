import {
    elapsedTime,
    elapsedTimeDetailed,
    formatDate,
    getCurrentDate,
} from '@/shared/util/date.util';

describe('date.util', () => {
    describe('getCurrentDate', () => {
        it('should return the current date in ISO format without Z', () => {
            const result = getCurrentDate();
            // Should look like '2025-05-23T14:30:00.000'
            expect(result).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/,
            );
        });
    });

    describe('formatDate', () => {
        it('should format date as YYYYMMDD and HHMM', () => {
            const date = new Date('2025-05-23T09:07:05.000Z');
            const { formatYYYYMMDD, formatHHMM } = formatDate(date);
            expect(formatYYYYMMDD).toBe('20250523');
            // The function uses local time, so we need to create a local date for comparison
            const localDate = new Date(date);
            const localHours = localDate.getHours().toString().padStart(2, '0');
            const localMinutes = localDate
                .getMinutes()
                .toString()
                .padStart(2, '0');
            expect(formatHHMM).toBe(`${localHours}${localMinutes}`);
        });

        it('should pad single digit months, days, hours, and minutes', () => {
            const date = new Date(2025, 0, 5, 3, 7); // Jan 5, 2025, 03:07
            const { formatYYYYMMDD, formatHHMM } = formatDate(date);
            expect(formatYYYYMMDD).toBe('20250105');
            expect(formatHHMM).toBe('0307');
        });
    });

    describe('elapsedTime', () => {
        it('should format milliseconds under 1 minute', () => {
            expect(elapsedTime(30000)).toBe('0:30');
        });

        it('should format 1 minute 5 seconds', () => {
            expect(elapsedTime(65000)).toBe('1:05');
        });

        it('should format hours:minutes:seconds', () => {
            expect(elapsedTime(3661000)).toBe('1:01:01');
        });

        it('should prefix negative duration with minus sign', () => {
            expect(elapsedTime(-5000)).toBe('-0:05');
        });

        it('should return 0:00 for zero ms', () => {
            expect(elapsedTime(0)).toBe('0:00');
        });
    });

    describe('elapsedTimeDetailed', () => {
        it('should return ms format for sub-second values', () => {
            expect(elapsedTimeDetailed(500)).toBe('500ms');
        });

        it('should return fractional seconds for 1-9 seconds', () => {
            expect(elapsedTimeDetailed(5000)).toBe('5.50s');
        });

        it('should return whole seconds for 10+ seconds', () => {
            expect(elapsedTimeDetailed(15000)).toBe('15s');
        });

        it('should return minutes and seconds', () => {
            expect(elapsedTimeDetailed(90000)).toBe('1m30s');
        });

        it('should return hours, minutes and seconds', () => {
            expect(elapsedTimeDetailed(3661000)).toBe('1h1m1s');
        });

        it('should return days, hours, minutes and seconds', () => {
            expect(elapsedTimeDetailed(90061000)).toBe('1d1h1m1s');
        });
    });
});
