import type { IntakeSchedule } from "../../ai/classify-intake";

/**
 * The owner's exam timetable of 20 Nov 2026, as a recorded reading
 * (2026-11-21). Transcribed from the coordinator's description of the
 * photo; the synthetic image `exam-timetable-std3-7.jpg` beside this file is
 * rendered from the same table (`exam-timetable-std3-7.html`) for a live run.
 */
const row = (dateText: string, cells: (string | null)[]): IntakeSchedule["rows"][number] => ({ dateText, dueDate: null, cells });
const OFF = [null, null, null, null, null];

export const EXAM_TIMETABLE_STD_3_7: IntakeSchedule = {
  kind: "exam",
  title: "Mid-Term Unit Test 2",
  school: "PODAR Innovation Centre",
  columns: ["Std. III", "Std. IV", "Std. V", "Std. VI", "Std. VII"],
  rows: [
    row("03-12-26 Thursday", ["English", "Mathematics", "Science", "English", "English"]),
    row("04-12-26 Friday", ["Humanities", "Hindi", "Humanities", "ICT Practical", "Hindi/French"]),
    row("05-12-26 Saturday", OFF),
    row("06-12-26 Sunday", OFF),
    row("07-12-26 Monday", ["Science", "English", "Mathematics", "Mathematics", "Science"]),
    row("08-12-26 Tuesday", ["Computing Theory", "Computing Theory", "English", "Hindi/French", "ICT Practical"]),
    row("09-12-26 Wednesday", ["Marathi", "Science", "Computing Theory", "Science", "Computing"]),
    row("10-12-26 Thursday", ["Mathematics", "Humanities", "French", "Computing", "Mathematics"]),
    row("11-12-26 Friday", ["Hindi/French", "French", "Hindi", "Humanities", "Humanities"]),
    row("12-12-26 Saturday", OFF),
    row("13-12-26 Sunday", OFF),
    row("14-12-26 Monday", ["Marathi", "Marathi", "Marathi", "Marathi", "Marathi"]),
  ],
};

/** Std. IV's column, as a person reading the photo would list it. */
export const STD_IV_PAPERS = [
  { onDate: "2026-12-03", subject: "Mathematics" },
  { onDate: "2026-12-04", subject: "Hindi" },
  { onDate: "2026-12-07", subject: "English" },
  { onDate: "2026-12-08", subject: "Computing Theory" },
  { onDate: "2026-12-09", subject: "Science" },
  { onDate: "2026-12-10", subject: "Humanities" },
  { onDate: "2026-12-11", subject: "French" },
  { onDate: "2026-12-14", subject: "Marathi" },
];
