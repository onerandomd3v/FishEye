export type FaqBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'comparison'; rows: { method: string; description: string }[] };

export type FaqEntry = {
  question: string;
  answer: FaqBlock[];
};

export const faqQuestions: FaqEntry[] = [
  {
    question:
      'How does FishEye detect suspicious activity while accounting for legitimate work?',
    answer: [
      {
        type: 'paragraph',
        text: 'FishEye compares employee activity with their normal behaviour and job responsibilities. It checks factors like working hours, devices, locations, access permissions, and the amount of data accessed.',
      },
      {
        type: 'paragraph',
        text: 'Instead of treating every unusual action as a threat, it considers multiple factors before assigning a risk score.',
      },
    ],
  },
  {
    question: 'What does the priority score mean?',
    answer: [
      {
        type: 'paragraph',
        text: "It's a score from 0 to 100 indicating how strongly an activity matches our suspicious-activity indicators.",
      },
      {
        type: 'list',
        items: ['Low: Below 40', 'Medium: 40–69', 'High: 70–100'],
      },
      {
        type: 'paragraph',
        text: "A higher score means the activity deserves greater attention. It doesn't mean the employee is guilty or that an attack has been confirmed.",
      },
    ],
  },
  {
    question: 'What happens when a finding is flagged?',
    answer: [
      {
        type: 'paragraph',
        text: "FishEye displays the finding in the analyst's investigation workspace, along with its risk score, severity, and supporting evidence.",
      },
      {
        type: 'paragraph',
        text: 'The analyst can examine why the activity was flagged and decide whether it needs further investigation.',
      },
    ],
  },
  {
    question: 'Does “Under review” stop an employee’s access?',
    answer: [
      {
        type: 'paragraph',
        text: 'No. It only means an analyst is investigating the finding.',
      },
      {
        type: 'paragraph',
        text: "FishEye doesn't automatically block employees or disable accounts. Those decisions remain outside the current system.",
      },
    ],
  },
  {
    question: 'How can an analyst record the outcome of an investigation?',
    answer: [
      {
        type: 'paragraph',
        text: 'The analyst opens a finding, reviews the evidence, selects a status, and can add a note.',
      },
      {
        type: 'paragraph',
        text: 'The supported statuses are Under review, Reviewed benign, and Escalated. The system records the reviewer and time without changing the original risk score or evidence.',
      },
    ],
  },
  {
    question:
      'How do simple rules, tuned rules, and contextual scoring differ?',
    answer: [
      {
        type: 'comparison',
        rows: [
          {
            method: 'Simple rules',
            description: 'Uses fixed conditions and a fixed alert threshold.',
          },
          {
            method: 'Tuned rules',
            description:
              'Uses the same rules but adjusts the alert threshold using calibration data.',
          },
          {
            method: 'Contextual scoring',
            description:
              'Considers more factors, including employee behaviour, job roles, devices, locations, and working hours, to calculate risk.',
          },
        ],
      },
      {
        type: 'paragraph',
        text: 'We compare all three using the same synthetic evaluation data to see whether context improves detection.',
      },
    ],
  },
  {
    question: 'How do you know whether the detector is working well?',
    answer: [
      {
        type: 'paragraph',
        text: 'We test it using labelled synthetic data where we know which activities represent threats and which are legitimate.',
      },
      {
        type: 'paragraph',
        text: 'We measure how many threats it detects, how many it misses, and how many false alarms it generates.',
      },
      {
        type: 'paragraph',
        text: 'The goal is to reduce false alarms without significantly increasing missed threats.',
      },
      {
        type: 'paragraph',
        text: 'Our current evaluation is experimental, not proof of real-world effectiveness.',
      },
    ],
  },
  {
    question: 'Why might a detector miss suspicious activity?',
    answer: [
      {
        type: 'paragraph',
        text: 'Because some suspicious activities can look normal.',
      },
      {
        type: 'paragraph',
        text: 'For example, someone using stolen credentials might access information during normal working hours using familiar devices.',
      },
      {
        type: 'paragraph',
        text: "If the activity doesn't trigger enough warning signs, the detector might miss it.",
      },
      {
        type: 'paragraph',
        text: "That's why we measure missed threats as well as false alarms.",
      },
    ],
  },
  {
    question: 'Has FishEye been validated with real bank data?',
    answer: [
      {
        type: 'paragraph',
        text: 'No. FishEye currently uses synthetic banking activity data for development and testing.',
      },
      {
        type: 'paragraph',
        text: "We haven't validated it with real bank data or demonstrated its effectiveness in a live banking environment.",
      },
    ],
  },
  {
    question:
      'What should a bank pilot prove before FishEye is used in practice?',
    answer: [
      {
        type: 'paragraph',
        text: 'A bank pilot should demonstrate that FishEye can:',
      },
      {
        type: 'list',
        items: [
          'Reduce unnecessary alerts without missing more genuine threats.',
          'Detect relevant suspicious activities using realistic banking data.',
          'Provide clear evidence that analysts can use during investigations.',
          "Operate securely and reliably within the bank's environment.",
        ],
      },
      {
        type: 'paragraph',
        text: 'Only after those results are independently evaluated should we consider using FishEye in actual banking operations.',
      },
    ],
  },
];
