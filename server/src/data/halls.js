// Hall layouts. A row is a list of segments: seats of one type or an aisle gap.
// Sofas take two grid cells. Rows are centred when the grid is built.

const std = (count) => ({ type: 'standard', count });
const vip = (count) => ({ type: 'vip', count });
const sofa = (count) => ({ type: 'sofa', count });
const gap = { gap: 1 };

function repeatRows(from, to, segments) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ row: from + i, segments }));
}

export const HALLS = [
  {
    code: 'p1',
    nameKey: 'halls.p1',
    formats: ['2D', '3D'],
    hasZavodSound: true,
    rows: [
      ...repeatRows(1, 5, [std(4), gap, std(8), gap, std(4)]),
      ...repeatRows(6, 7, [std(4), gap, vip(8), gap, std(4)]),
      ...repeatRows(8, 11, [std(4), gap, std(8), gap, std(4)]),
      { row: 12, segments: [sofa(2), gap, sofa(3), gap, sofa(2)] },
    ],
  },
  {
    code: 'p2',
    nameKey: 'halls.p2',
    formats: ['2D', '3D'],
    hasZavodSound: false,
    rows: [
      ...repeatRows(1, 4, [std(3), gap, std(7), gap, std(3)]),
      { row: 5, segments: [std(3), gap, vip(7), gap, std(3)] },
      ...repeatRows(6, 8, [std(3), gap, std(7), gap, std(3)]),
      { row: 9, segments: [sofa(2), gap, sofa(2), gap, sofa(2)] },
    ],
  },
  {
    code: 'p3',
    nameKey: 'halls.p3',
    formats: ['2D'],
    hasZavodSound: false,
    rows: [
      ...repeatRows(1, 2, [std(4), gap, std(4)]),
      ...repeatRows(3, 4, [vip(4), gap, vip(4)]),
      { row: 5, segments: [sofa(2), gap, sofa(2)] },
    ],
  },
];

/** Expands a hall layout into seat records with grid coordinates. */
export function buildSeats(hall) {
  const widths = hall.rows.map((row) =>
    row.segments.reduce((sum, s) => sum + (s.gap ?? s.count * (s.type === 'sofa' ? 2 : 1)), 0),
  );
  const maxWidth = Math.max(...widths);
  const seats = [];

  hall.rows.forEach((row, index) => {
    let x = Math.floor((maxWidth - widths[index]) / 2);
    let number = 1;
    for (const segment of row.segments) {
      if (segment.gap) {
        x += segment.gap;
        continue;
      }
      const width = segment.type === 'sofa' ? 2 : 1;
      for (let i = 0; i < segment.count; i += 1) {
        seats.push({
          row: row.row,
          number: number++,
          type: segment.type,
          gridX: x,
          gridY: index,
          width,
        });
        x += width;
      }
    }
  });

  return seats;
}
