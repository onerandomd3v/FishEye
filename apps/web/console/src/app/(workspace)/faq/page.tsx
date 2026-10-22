import { PageHeading } from '../shared';
import { faqQuestions } from './content';
import type { FaqEntry } from './content';

function QuestionList({ questions }: { questions: FaqEntry[] }) {
  return (
    <div className="faq-list">
      {questions.map(({ question, answer }) => (
        <details className="faq-item" key={question}>
          <summary>{question}</summary>
          <div className="faq-answer">
            {answer.map((block, index) => {
              if (block.type === 'list') {
                return (
                  <ul key={index}>
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                );
              }

              if (block.type === 'comparison') {
                return (
                  <div className="faq-table-wrap" key={index}>
                    <table className="faq-comparison-table">
                      <thead>
                        <tr>
                          <th scope="col">Method</th>
                          <th scope="col">How it works</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map(({ method, description }) => (
                          <tr key={method}>
                            <th scope="row">{method}</th>
                            <td>{description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return <p key={index}>{block.text}</p>;
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <PageHeading
        title="Frequently Asked Questions"
        description="Learn how FishEye works, how we evaluate it, and what still needs to be proven."
      />

      <div className="faq-content">
        <section
          className="faq-section"
          aria-label="Frequently asked questions"
        >
          <QuestionList questions={faqQuestions} />
        </section>
      </div>
    </>
  );
}
