import {
  buildQaComposeArgs,
  checkQaContainer,
  checkQaDatabaseUri,
  QA_CONTAINERS,
  type ContainerInspect,
} from './qa-config';

const qaContainer = (
  expected: (typeof QA_CONTAINERS)[keyof typeof QA_CONTAINERS],
  overrides: Partial<ContainerInspect> = {},
): ContainerInspect => ({
  Name: `/${expected.name}`,
  State: { Running: true },
  Config: {
    Labels: {
      'com.docker.compose.project': 'pet-adoption-qa',
      'com.docker.compose.service': expected.service,
    },
  },
  Mounts: [
    { Type: 'volume', Name: expected.volume, Destination: expected.mount },
  ],
  ...overrides,
});

describe('checkQaContainer (reset safeguard)', () => {
  it.each(Object.values(QA_CONTAINERS))(
    'accepts the QA $service container',
    (expected) => {
      expect(checkQaContainer(expected, qaContainer(expected))).toEqual([]);
    },
  );

  it('refuses a missing container', () => {
    expect(checkQaContainer(QA_CONTAINERS.mongodb, undefined)).toEqual([
      expect.stringContaining('container not found'),
    ]);
  });

  it('refuses the development containers', () => {
    const dev: ContainerInspect = {
      Name: '/pet-adoption-mongodb',
      State: { Running: true },
      Config: {
        Labels: {
          'com.docker.compose.project': 'pet-adoption-system',
          'com.docker.compose.service': 'mongodb',
        },
      },
      Mounts: [
        {
          Type: 'volume',
          Name: 'pet-adoption-system_mongodb_data',
          Destination: '/data/db',
        },
      ],
    };

    const problems = checkQaContainer(QA_CONTAINERS.mongodb, dev);

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unexpected container name'),
        expect.stringContaining('"pet-adoption-system"'),
        expect.stringContaining('not the QA volume'),
      ]),
    );
  });

  it.each([
    [
      'another project',
      {
        Config: {
          Labels: {
            'com.docker.compose.project': 'pet-adoption-system',
            'com.docker.compose.service': 'mongodb',
          },
        },
      },
      'Compose project',
    ],
    [
      'another service',
      {
        Config: {
          Labels: {
            'com.docker.compose.project': 'pet-adoption-qa',
            'com.docker.compose.service': 'api',
          },
        },
      },
      'is service "api"',
    ],
    ['a stopped container', { State: { Running: false } }, 'not running'],
    [
      'the development volume',
      {
        Mounts: [
          {
            Type: 'volume',
            Name: 'pet-adoption-system_mongodb_data',
            Destination: '/data/db',
          },
        ],
      },
      'not the QA volume',
    ],
    [
      'a bind mount',
      { Mounts: [{ Type: 'bind', Destination: '/data/db' }] },
      'not the QA volume',
    ],
    ['no data mount', { Mounts: [] }, 'not mounted'],
  ])('refuses %s', (_label, overrides, message) => {
    expect(
      checkQaContainer(
        QA_CONTAINERS.mongodb,
        qaContainer(
          QA_CONTAINERS.mongodb,
          overrides as Partial<ContainerInspect>,
        ),
      ),
    ).toEqual([expect.stringContaining(message)]);
  });
});

describe('checkQaDatabaseUri (reset safeguard)', () => {
  it('accepts the QA service and database', () => {
    expect(
      checkQaDatabaseUri([
        'MONGODB_URI=mongodb://mongodb:27017/pet-adoption-qa?directConnection=true',
      ]),
    ).toEqual([]);
  });

  it.each([
    [
      'mongodb://mongodb:27017/pet-adoption?directConnection=true',
      'uses database "pet-adoption"',
    ],
    [
      'mongodb://mongodb:27017/pet-adoption-demo',
      'uses database "pet-adoption-demo"',
    ],
    [
      'mongodb://host.docker.internal:27018/pet-adoption-qa',
      'connects to "host.docker.internal"',
    ],
    ['mongodb://localhost:27018/pet-adoption-qa', 'connects to "localhost"'],
    ['not a url', 'not a valid URL'],
  ])('refuses %s', (uri, message) => {
    expect(checkQaDatabaseUri([`MONGODB_URI=${uri}`])).toEqual([
      expect.stringContaining(message),
    ]);
  });

  it('refuses a missing MONGODB_URI', () => {
    expect(checkQaDatabaseUri(['PORT=3333'])).toEqual([
      expect.stringContaining('not set'),
    ]);
  });
});

describe('buildQaComposeArgs', () => {
  const base = [
    'compose',
    '-f',
    'docker-compose.qa.yml',
    '-p',
    'pet-adoption-qa',
  ];

  it.each([
    ['up', [], ['up', '-d', '--build']],
    ['ps', [], ['ps']],
    ['logs', ['api'], ['logs', '-f', 'api']],
    ['down', [], ['down']],
  ])(
    'runs %s %j only against the QA file and project',
    (command, extra, args) => {
      expect(buildQaComposeArgs(command, extra)).toEqual([...base, ...args]);
    },
  );

  it.each([['-v'], ['--volumes'], ['--volumes=true'], ['-fv'], ['--rmi']])(
    'refuses "down %s" (it would delete data)',
    (option) => {
      expect(() => buildQaComposeArgs('down', [option])).toThrow(
        'would delete QA data',
      );
    },
  );

  it('refuses other options and unknown services or commands', () => {
    expect(() =>
      buildQaComposeArgs('up', ['--project-name=pet-adoption-system']),
    ).toThrow('not allowed');
    expect(() => buildQaComposeArgs('logs', ['mongodb-dev'])).toThrow(
      'not allowed',
    );
    expect(() => buildQaComposeArgs('rm', [])).toThrow('Unknown QA command');
    expect(() => buildQaComposeArgs(undefined, [])).toThrow(
      'Unknown QA command',
    );
  });
});
