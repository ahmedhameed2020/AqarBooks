export type CommandCenterModule = "maintenance" | "visitors" | "unitExperience";

export interface CommandCenterAccess {
  maintenance: boolean;
  visitors: boolean;
  unitExperience: boolean;
}

export interface CommandCenterMaintenanceItem {
  id: string;
  requestNo: string;
  title: string;
  status: "SUBMITTED" | "TRIAGED" | "IN_PROGRESS" | "WAITING";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  submittedAt: string;
  unitCode: string;
}

export interface CommandCenterVisitorItem {
  id: string;
  invitationNo: string;
  guestName: string;
  validUntil: string;
  unitCode: string;
}

export interface CommandCenterVehicleItem {
  id: string;
  plateNumber: string;
  make: string | null;
  model: string | null;
  createdAt: string;
  unitCode: string;
}

export interface CommandCenterNotificationItem {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionUrl: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  createdAt: string;
}

export interface PortalCommandCenterDTO {
  access: CommandCenterAccess;
  counts: {
    openMaintenance: number;
    activeVisitors: number;
    activeVehicles: number;
    unreadNotifications: number;
  };
  maintenance: CommandCenterMaintenanceItem[];
  visitors: CommandCenterVisitorItem[];
  vehicles: CommandCenterVehicleItem[];
  notifications: CommandCenterNotificationItem[];
  unavailableModules: CommandCenterModule[];
}

export const EMPTY_PORTAL_COMMAND_CENTER: PortalCommandCenterDTO = {
  access: { maintenance: false, visitors: false, unitExperience: false },
  counts: {
    openMaintenance: 0,
    activeVisitors: 0,
    activeVehicles: 0,
    unreadNotifications: 0,
  },
  maintenance: [],
  visitors: [],
  vehicles: [],
  notifications: [],
  unavailableModules: [],
};
