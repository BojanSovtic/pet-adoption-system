import { useTranslation } from 'react-i18next';
import { Check, CircleHelp, Clock, X, type LucideIcon } from 'lucide-react';
import {
  PET_COMPATIBILITY_TARGETS,
  type Pet,
  type PetCompatibilityValue,
} from '@pet-adoption/models';

import { cn } from '@/lib/utils';

const COMPATIBILITY_ICONS: Record<
  PetCompatibilityValue,
  { icon: LucideIcon; className: string }
> = {
  yes: { icon: Check, className: 'bg-success-subtle text-success' },
  no: { icon: X, className: 'bg-destructive-subtle text-destructive' },
  unknown: { icon: CircleHelp, className: 'bg-muted text-muted-foreground' },
};

type RowProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName: string;
};

// The icon only repeats the text value, so it is hidden from screen readers.
const Row = ({ label, value, icon: Icon, iconClassName }: RowProps) => (
  <div className="flex items-center justify-between gap-4 py-3">
    <dt className="text-sm font-medium">{label}</dt>
    <dd className="flex items-center gap-2 text-sm">
      {value}
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 items-center justify-center rounded-full',
          iconClassName,
        )}
      >
        <Icon className="size-3.5" />
      </span>
    </dd>
  </div>
);

type PetLifestyleProps = {
  pet: Pick<Pet, 'name' | 'compatibility' | 'aloneTime'>;
};

/**
 * Whether the pet suits the adopter's home: children, other animals and time
 * alone. Shown as a short list so it can be scanned, like the facts.
 */
const PetLifestyle = ({ pet }: PetLifestyleProps) => {
  const { t } = useTranslation('pets');

  return (
    <section
      aria-labelledby="pet-lifestyle"
      className="space-y-2 rounded-lg border bg-card p-6 shadow-card"
    >
      <h2 id="pet-lifestyle" className="text-xl">
        {t('lifestyle.title')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('lifestyle.subtitle', { name: pet.name })}
      </p>

      <dl className="divide-y">
        {PET_COMPATIBILITY_TARGETS.map((target) => {
          const value = pet.compatibility[target];
          const { icon, className } = COMPATIBILITY_ICONS[value];

          return (
            <Row
              key={target}
              label={t(`lifestyle.${target}`)}
              value={t(`compatibilityValue.${value}`)}
              icon={icon}
              iconClassName={className}
            />
          );
        })}

        <Row
          label={t('lifestyle.aloneTime')}
          value={t(`aloneTime.${pet.aloneTime}`)}
          icon={pet.aloneTime === 'unknown' ? CircleHelp : Clock}
          iconClassName="bg-muted text-muted-foreground"
        />
      </dl>
    </section>
  );
};

export { PetLifestyle };
