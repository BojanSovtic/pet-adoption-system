export enum VALIDATOR_TYPE {
  REQUIRE = "REQUIRE",
  MINLENGTH = "MINLENGTH",
  MAXLENGTH = "MAXLENGTH",
  MIN = "MIN",
  MAX = "MAX",
  EMAIL = "EMAIL",
  FILE = "FILE",
}

interface BaseValidator {
  type: VALIDATOR_TYPE;
}

interface ValueValidator extends BaseValidator {
  type: VALIDATOR_TYPE.MINLENGTH | VALIDATOR_TYPE.MAXLENGTH | VALIDATOR_TYPE.MIN | VALIDATOR_TYPE.MAX;
  val: number;
}

interface TypeOnlyValidator extends BaseValidator {
  type: VALIDATOR_TYPE.REQUIRE | VALIDATOR_TYPE.EMAIL | VALIDATOR_TYPE.FILE;
  val?: never;
}

export type Validator = ValueValidator | TypeOnlyValidator;

export const VALIDATOR_REQUIRE = (): TypeOnlyValidator => ({ type: VALIDATOR_TYPE.REQUIRE });
export const VALIDATOR_FILE = (): TypeOnlyValidator => ({ type: VALIDATOR_TYPE.FILE });
export const VALIDATOR_EMAIL = (): TypeOnlyValidator => ({ type: VALIDATOR_TYPE.EMAIL });
export const VALIDATOR_MINLENGTH = (val: number): ValueValidator => ({
  type: VALIDATOR_TYPE.MINLENGTH,
  val: val,
});
export const VALIDATOR_MAXLENGTH = (val: number): ValueValidator => ({
  type: VALIDATOR_TYPE.MAXLENGTH,
  val: val,
});
export const VALIDATOR_MIN = (val: number): ValueValidator => ({
  type: VALIDATOR_TYPE.MIN,
  val: val,
});
export const VALIDATOR_MAX = (val: number): ValueValidator => ({
  type: VALIDATOR_TYPE.MAX,
  val: val,
});

export const validate = (value: string | number, validators: Validator[]): boolean => {
  let isValid = true;
  const stringValue = String(value);

  for (const validator of validators) {
    if (validator.type === VALIDATOR_TYPE.REQUIRE) {
      isValid = isValid && stringValue.trim().length > 0;
    }

    if (validator.type === VALIDATOR_TYPE.MINLENGTH) {
      isValid = isValid && stringValue.trim().length >= (validator as ValueValidator).val;
    }

    if (validator.type === VALIDATOR_TYPE.MAXLENGTH) {
      isValid = isValid && stringValue.trim().length <= (validator as ValueValidator).val;
    }

    if (validator.type === VALIDATOR_TYPE.MIN) {
      isValid = isValid && +stringValue >= (validator as ValueValidator).val;
    }

    if (validator.type === VALIDATOR_TYPE.MAX) {
      isValid = isValid && +stringValue <= (validator as ValueValidator).val;
    }

    if (validator.type === VALIDATOR_TYPE.EMAIL) {
      isValid = isValid && /^\S+@\S+\.\S+$/.test(stringValue);
    }
  }

  return isValid;
};