export interface RouteConfig {
    route: string;
    summary: string;
    version: readonly string[];
}

export interface Route {
    root: string;
    tag: string;
    [key: string]: string | RouteConfig;
}

export type RouteSet = Record<
    string,
    (typeof TmfRoutes)[keyof typeof TmfRoutes]
>;

// Define TMF as a separate RouteSet
const TmfRoutes = {
    geographicAddressManagement: {
        root: 'geographicAddressManagement',
        tag: 'Geographic Address (TMF673)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        list: {
            route: 'geographicAddress',
            summary:
                "This operation can be made by one or more parameters. Ex: 'streetNr' + 'postcode'",
            version: ['1'],
        },
        get: {
            route: 'geographicAddress/:id',
            summary: 'This operation retrieves a GeographicAddress entity.',
            version: ['1'],
        },
        getExt: {
            route: 'internal/externalSystems/:externalId',
            summary: 'This operation retrieves a GeographicAddress entity.',
            version: ['1'],
        },
    },
    serviceQualificationManagement: {
        root: 'serviceQualificationManagement',
        tag: 'Service Qualification (TMF645)',
        health: {
            route: 'actuator/health',
            summary: 'This operation is only used for API health check.',
            version: ['1'],
        },
        create: {
            route: 'checkServiceQualification',
            summary:
                'This operation creates a CheckServiceQualification entity.',
            version: ['1'],
        },
    },
    resourcePoolManagement: {
        root: 'resourcePoolManagement',
        tag: 'Resource Pool Management (TMF685)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'reservation',
            summary: 'This operation creates a Reservation.',
            version: ['1'],
        },
        list: {
            route: 'reservation',
            summary: 'This operation list or find Reservation entities',
            version: ['1'],
        },
        get: {
            route: 'reservation/:id',
            summary:
                'This operation retrieves a Reservation. Attribute selection is enabled for all first level attributes.',
            version: ['1'],
        },
    },
    appointment: {
        root: 'appointment',
        tag: 'Appointment (TMF646)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'appointment',
            summary: 'This operation creates a Appointment entity.',
            version: ['1'],
        },
        createListener: {
            route: 'listener/appointmentStateChangeEvent',
            summary:
                'This operation is a client listener for receiving the notification AppointmentStateChangeEvent',
            version: ['1'],
        },
        createListenerInternal: {
            route: 'internal/appointmentStateChangeEvent',
            summary:
                'This operation is used internally to receive notification of AppointmentStateChangeEvent',
            version: ['1'],
        },
        delete: {
            route: 'appointment/:workOrderId',
            summary: 'This operation cancels an Appointment entity.',
            version: ['1'],
        },
        update: {
            route: 'appointment',
            summary: 'This operation updates partially a Appointment entity.',
            version: ['1'],
        },
        list: {
            route: 'appointment',
            summary: 'This operation list or find Appointment',
            version: ['1'],
        },
        searchTimeSlot: {
            route: 'searchTimeSlot',
            summary: 'This operation list or find SearchTimeSlot entities',
            version: ['1'],
        },
        get: {
            route: 'appointment/:serviceAppointmentId',
            summary:
                'This operation retrieves a Appointment entity. Attribute selection is enabled for all first level attributes.',
            version: ['1'],
        },
    },
    serviceOrderingManagement: {
        root: 'serviceOrderingManagement',
        tag: 'Service Ordering (TMF641)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'serviceOrder',
            summary: 'This operation creates a ServiceOrder entity.',
            version: ['1'],
        },
        cancel: {
            route: 'cancelServiceOrder',
            summary: 'This operation creates a CancelServiceOrder entity.',
            version: ['1'],
        },
        serviceOrderStateChangeEvent: {
            route: 'listener/serviceOrderStateChangeEvent',
            summary:
                "This operation is an example of returning asynchronously to the tenant when the callback attribute in POST. This return will be to the previously registered tenant endpoint and orchestrated by a service dedicated to returning data to tenants. The return obtained will only be known to the service responsible for communicating with the tenant's endpoint. Therefore, HTTP error codes are not visible to the external client.",
            version: ['1'],
        },
        update: {
            route: 'serviceOrder/:id',
            summary: 'This operation updates partially a ServiceOrder entity.',
            version: ['1'],
        },
        list: {
            route: 'serviceOrder',
            summary: 'This operation list or find ServiceOrder entities',
            version: ['1'],
        },
        get: {
            route: 'serviceOrder/:id',
            summary: 'This operation retrieves a ServiceOrder entity.',
            version: ['1'],
        },
    },
    serviceInventoryManagement: {
        root: 'serviceInventoryManagement',
        tag: 'Service Inventory (TMF638)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        getById: {
            route: 'service/:name',
            summary: 'This operation retrieves a Service entity.',
            version: ['1'],
        },
        getByName: {
            route: 'internal/service/:name',
            summary: 'This operation retrieves a Service entity.',
            version: ['1'],
        },
    },
    troubleTicket: {
        root: 'troubleTicket',
        tag: 'Trouble Ticket (TMF621)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'troubleTicket',
            summary: 'This operation creates a TroubleTicket entity.',
            version: ['1'],
        },
        createListener: {
            route: 'listener/troubleTicketStatusChangeEvent',
            summary:
                'Client listener for entity TroubleTicketStatusChangeEvent',
            version: ['1'],
        },
        update: {
            route: 'troubleTicket/:id',
            summary: 'This operation updates partially a TroubleTicket entity.',
            version: ['1'],
        },
        delete: {
            route: 'troubleTicket/:id',
            summary: 'This operation cancels a TroubleTicket entity.',
            version: ['1'],
        },
        list: {
            route: 'troubleTicket',
            summary:
                'This operation list or find TroubleTicket entities. Almost one of filter parameter. At least one of the parameters is mandatory.',
            version: ['1'],
        },
        get: {
            route: 'troubleTicket/:id',
            summary: 'This operation retrieves a TroubleTicket entity.',
            version: ['1'],
        },
    },
    serviceTestManagement: {
        root: 'serviceTestManagement',
        tag: 'Service Test (TMF653)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'serviceTest',
            summary: 'This operation creates a ServiceTest entity.',
            version: ['1'],
        },
        createListener: {
            route: 'listener/serviceTestAttributeValueChangeEvent',
            summary:
                "This operation is an example of returning asynchronously to the tenant. This return will be to the previously registered tenant endpoint and orchestrated by a service dedicated to returning data to tenants. The return obtained will only be known to the service responsible for communicating with the tenant's endpoint. Therefore, HTTP error codes are not visible to the external client.",
            version: ['1'],
        },
        callback: {
            route: 'callback',
            summary: 'This operation receive a asynchronously Openlabs return',
            version: ['1'],
        },
    },
    serviceActivationAndConfiguration: {
        root: 'serviceActivationAndConfiguration',
        tag: 'Service Activation and Configuration (TMF640)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        create: {
            route: 'service',
            summary: 'This operation creates a Service entity.',
            version: ['1'],
        },
        getConfigurationById: {
            route: 'service/configurations/:id',
            summary: 'This operation retrieve a service configuration entity',
            version: ['1'],
        },
        getServiceByServiceId: {
            route: 'service/:serviceId',
            summary:
                'This operation list or find service configuration entities',
            version: ['1'],
        },
    },
    communication: {
        root: 'communication',
        tag: 'Communication (TMF681)',
        listen: {
            route: 'listener/communicationMessage',
            summary: 'Notifica incidentes massivos',
            version: ['1'],
        },
    },
    alarmManagement: {
        root: 'alarmManagement',
        tag: 'Alarm Management (TMF642)',
        create: {
            route: 'alarms',
            summary: 'Creates a new alarm based on the provided payload.',
            version: ['1'],
        },
        ack: {
            route: 'ackAlarm',
            summary: 'This operation calls an AckAlarm entity.',
            version: ['1'],
        },
        unAck: {
            route: 'unAckAlarm',
            summary: 'This operation calls an UnAckAlarm entity.',
            version: ['1'],
        },
        clear: {
            route: 'clearAlarm',
            summary: 'This operation calls a ClearAlarm entity.',
            version: ['1'],
        },
        update: {
            route: 'alarms/:id',
            summary: 'Updates the state or details of an existing alarm.',
            version: ['1'],
        },
        get: {
            route: 'alarm/:id',
            summary:
                'This operation retrieves a Alarm entity. Attribute selection enabled for all first level attributes.',
            version: ['1'],
        },
        list: {
            route: 'alarm',
            summary: 'List or find Alarm objects',
            version: ['1'],
        },
    },
    serviceProblemManagement: {
        root: 'serviceProblemManagement',
        tag: 'Service Problem Management (TMF656)',
        health: {
            route: 'actuator/health',
            summary: 'This operation health check from api',
            version: ['1'],
        },
        createListener: {
            route: 'listener/serviceProblemCreateEvent',
            summary:
                'This operation is an example of returning asynchronously to the tenant when a massive incident accours.',
            version: ['1'],
        },
        list: {
            route: 'serviceProblem',
            summary: 'This operation list or find ServiceProblem entities',
            version: ['1'],
        },
        get: {
            route: 'serviceProblem/:id',
            summary: 'This operation find ServiceProblem entities',
            version: ['1'],
        },
    },
    resourceInventoryManagement: {
        root: 'resourceInventoryManagement',
        tag: 'Resource Inventory (TMF639)',
        health: {
            route: 'actuator/health',
            summary: 'Health Check',
            version: ['1'],
        },
        get: {
            route: 'resource/:id',
            summary: 'This operation retrieves a resource entity.',
            version: ['1'],
        },
    },
    resourceCatalog: {
        root: 'resourceCatalog',
        tag: 'Resource Catalog',
        list: {
            route: '',
            summary: 'List or find ResourceCatalog objects',
            version: ['1'],
        },
        create: {
            route: '',
            summary: 'Creates a ResourceCatalog',
            version: ['1'],
        },
        get: {
            route: ':id',
            summary: 'Retrieves a ResourceCatalog by ID',
            version: ['1'],
        },
        patch: {
            route: ':id',
            summary: 'Updates partially a ResourceCatalog',
            version: ['1'],
        },
    },
    resourceCategory: {
        root: 'resourceCategory',
        tag: 'Resource Category',
        list: {
            route: '',
            summary: 'List or find ResourceCategory objects',
            version: ['1'],
        },
        create: {
            route: '',
            summary: 'Creates a ResourceCategory',
            version: ['1'],
        },
        get: {
            route: ':id',
            summary: 'Retrieves a ResourceCategory by ID',
            version: ['1'],
        },
        patch: {
            route: ':id',
            summary: 'Updates partially a ResourceCategory',
            version: ['1'],
        },
    },
    resourceSpecification: {
        root: 'resourceSpecification',
        tag: 'Resource Specification',
        list: {
            route: '',
            summary: 'List or find ResourceSpecification objects',
            version: ['1'],
        },
        create: {
            route: '',
            summary: 'Creates a ResourceSpecification',
            version: ['1'],
        },
        get: {
            route: ':id',
            summary: 'Retrieves a ResourceSpecification by ID',
            version: ['1'],
        },
        patch: {
            route: ':id',
            summary: 'Updates partially a ResourceSpecification',
            version: ['1'],
        },
    },
    resourceCandidate: {
        root: 'resourceCandidate',
        tag: 'Resource Candidate',
        list: {
            route: '',
            summary: 'List or find ResourceCandidate objects',
            version: ['1'],
        },
        get: {
            route: ':id',
            summary: 'Retrieves a ResourceCandidate by ID',
            version: ['1'],
        },
        patch: {
            route: ':id',
            summary: 'Updates partially a ResourceCandidate',
            version: ['1'],
        },
    },
    hub: {
        root: 'hub',
        tag: 'Events Subscription',
        list: {
            route: '',
            summary: 'List or find subscriptions (hub) to receive events',
            version: ['1'],
        },
        create: {
            route: '',
            summary: 'Create a subscription (hub) to receive events',
            version: ['1'],
        },
        delete: {
            route: ':id',
            summary: 'Remove a subscription (hub) to receive events',
            version: ['1'],
        },
    },
    audit: {
        root: 'audit',
        tag: 'Audit',
        list: {
            route: '',
            summary: 'List or find audit records',
            version: ['1'],
        },
        get: {
            route: ':id',
            summary: 'Retrieves an audit record by ID',
            version: ['1'],
        },
    },
    listener: {
        root: 'listener',
        tag: 'Notification Listener',
        resourceSpecificationCreate: {
            route: 'resourceSpecificationCreateEvent',
            summary: 'Client listener for ResourceSpecificationCreateEvent',
            version: ['1'],
        },
        resourceSpecificationAttributeValueChange: {
            route: 'resourceSpecificationAttributeValueChangeEvent',
            summary:
                'Client listener for ResourceSpecificationAttributeValueChangeEvent',
            version: ['1'],
        },
    },
} as const;

export const Routes = {
    utils: {
        root: 'utils',
        tag: 'Utils',
        compress: {
            route: 'compress',
            summary: 'Compress data using LZ library',
        },
        decompress: {
            route: 'decompress',
            summary: 'Uncompress data using LZ library',
        },
        xmlToJson: {
            route: 'xml-to-json',
            summary: 'Convert XML to JSON',
        },
        codeFormat: {
            route: 'code-format',
            summary: 'Format code using the Prettier library',
        },
    },
    sis: {
        root: 'listener/sis',
        tag: 'SIS',
        associarOntHdm: {
            route: 'associar-ont-hdm',
            summary: 'Associar Ont HDM',
        },
        instalarHsiNass: {
            route: 'instalar-hsi-nass',
            summary: 'Instalar HSI NASS',
        },
        modificarHsiApc: {
            route: 'modificar-hsi-apc',
            summary: 'Modificar HSI APC',
        },
        bngClear: {
            route: 'bng-clear',
            summary: 'BNG Clear',
        },
        gponOntReset: {
            route: 'gpon-ont-reset',
            summary: 'GPON Ont Reset',
        },
    },
    tmf: TmfRoutes,
};
