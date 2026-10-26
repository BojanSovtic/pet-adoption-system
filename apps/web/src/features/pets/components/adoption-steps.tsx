import { useTranslation } from 'react-i18next';

const STEPS = ['apply', 'review', 'home'] as const;

type AdoptionStepsProps = {
  petName: string;
};

/**
 * What happens after applying, so people know what to expect before they
 * commit. The text mirrors the real rules (docs/requirements.md).
 */
const AdoptionSteps = ({ petName }: AdoptionStepsProps) => {
  const { t } = useTranslation('pets');

  return (
    <section
      aria-labelledby="adoption-steps"
      className="space-y-4 rounded-lg border bg-card p-6 shadow-card"
    >
      <h2 id="adoption-steps" className="text-xl">
        {t('steps.title')}
      </h2>

      <ol className="space-y-4">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="font-semibold">{t(`steps.${step}.title`)}</h3>
              <p className="text-sm text-muted-foreground">
                {t(`steps.${step}.text`, { name: petName })}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm text-muted-foreground">{t('steps.withdraw')}</p>
    </section>
  );
};

export { AdoptionSteps };
