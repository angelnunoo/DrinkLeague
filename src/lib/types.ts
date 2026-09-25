export type UserRole = "user" | "superadmin" | "global_admin";
export type UserStatus = "active" | "suspended" | "deleted";
export type MembershipRole = "member" | "league_admin";
export type MembershipStatus = "active" | "left" | "removed";
export type LeagueStatus = "active" | "archived" | "suspended";

export type DrinkCode =
  | "tequifresa"
  | "cerveza"
  | "jarra"
  | "chupito"
  | "copa";

export const DRINK_POINTS: Record<DrinkCode, number> = {
  tequifresa: 1,
  cerveza: 3,
  jarra: 5,
  chupito: 7,
  copa: 10,
};

export const DRINK_LABELS: Record<DrinkCode, string> = {
  tequifresa: "Tequifresa",
  cerveza: "Cerveza",
  jarra: "Jarra",
  chupito: "Chupito",
  copa: "Copa",
};

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  xp: number;
  level: number;
  created_at: string;
  friend_code?: string | null;
  username?: string | null;
  banner_url?: string | null;
  title?: string | null;
  rank_tier?: string | null;
  token_balance?: number | null;
  birth_date?: string | null;
  equipped_cosmetics?: Record<string, string> | null;
  equipped_title_code?: string | null;
  prestige_level?: number | null;
};

export type ShopItem = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  price_tokens: number;
  tier: string | null;
  is_active: boolean;
};

export type League = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  timezone: string;
  status: LeagueStatus;
  created_at: string;
};

export type LeagueWithMembership = League & {
  membership_role: MembershipRole;
};

export type DrinkType = {
  id: number;
  code: DrinkCode;
  name: string;
  points: number;
  sort_order: number;
};

export type DrinkItemInput = {
  code: DrinkCode;
  quantity: number;
};

export type LeaderboardRow = {
  user_id: string;
  points: number;
  logs_count: number;
  display_name: string;
  level: number;
  joined_at: string;
};

export type ActivityEvent = {
  id: string;
  league_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor?: Pick<Profile, "display_name" | "avatar_url" | "level"> | null;
};

export type Database = {
  public: {
    Tables: {
      users: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email" | "display_name">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      leagues: {
        Row: League;
        Insert: Partial<League> & Pick<League, "name" | "created_by">;
        Update: Partial<League>;
        Relationships: [];
      };
    };
    Functions: {
      create_league: {
        Args: {
          p_name: string;
          p_description?: string | null;
          p_timezone?: string;
        };
        Returns: {
          league_id: string;
          invite_code: string;
          invite_token: string;
        }[];
      };
      join_league_by_code: {
        Args: { p_code: string };
        Returns: string;
      };
      join_league_by_token: {
        Args: { p_token: string };
        Returns: string;
      };
      log_drinks: {
        Args: {
          p_league_id: string;
          p_venue_name: string;
          p_items: DrinkItemInput[];
        };
        Returns: string;
      };
      log_drinks_global: {
        Args: {
          p_venue_name: string;
          p_items: DrinkItemInput[];
        };
        Returns: string;
      };
    };
  };
};
