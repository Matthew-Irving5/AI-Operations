export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      actions: {
        Row: {
          action_type: string;
          approval_required: boolean;
          approval_state: string;
          authority: string;
          contract_version: number;
          conversation_id: string | null;
          correlation_id: string;
          created_at: string;
          description: string;
          id: string;
          idempotency_key: string;
          manager_id: string | null;
          proposed_payload: NonNullable<Json>;
          required_capability: string | null;
          required_permissions: string[];
          risk_class: Database['public']['Enums']['risk_class'];
          run_id: string | null;
          source_message_id: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_type: string;
          approval_required?: boolean;
          approval_state?: string;
          authority?: string;
          contract_version?: number;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          description: string;
          id?: string;
          idempotency_key?: string;
          manager_id?: string | null;
          proposed_payload?: NonNullable<Json>;
          required_capability?: string | null;
          required_permissions?: string[];
          risk_class: Database['public']['Enums']['risk_class'];
          run_id?: string | null;
          source_message_id?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_type?: string;
          approval_required?: boolean;
          approval_state?: string;
          authority?: string;
          contract_version?: number;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          idempotency_key?: string;
          manager_id?: string | null;
          proposed_payload?: NonNullable<Json>;
          required_capability?: string | null;
          required_permissions?: string[];
          risk_class?: Database['public']['Enums']['risk_class'];
          run_id?: string | null;
          source_message_id?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'actions_conversation_user_fk';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'actions_manager_id_fkey';
            columns: ['manager_id'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'actions_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'actions_source_message_user_fk';
            columns: ['source_message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'actions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_calls: {
        Row: {
          actual_cost: number | null;
          actual_input_tokens: number | null;
          actual_output_tokens: number | null;
          cached_input_tokens: number;
          completed_at: string | null;
          created_at: string;
          estimated_cost: number;
          id: string;
          model_id: string | null;
          prompt_version_id: string | null;
          provider_usage: NonNullable<Json>;
          reasoning_tokens: number;
          redacted_trace: NonNullable<Json>;
          request_id: string | null;
          response_id: string | null;
          run_id: string | null;
          search_calls: number;
          status: string;
          trace_object_reference: string | null;
          user_id: string;
          validation_status: string;
        };
        Insert: {
          actual_cost?: number | null;
          actual_input_tokens?: number | null;
          actual_output_tokens?: number | null;
          cached_input_tokens?: number;
          completed_at?: string | null;
          created_at?: string;
          estimated_cost?: number;
          id?: string;
          model_id?: string | null;
          prompt_version_id?: string | null;
          provider_usage?: NonNullable<Json>;
          reasoning_tokens?: number;
          redacted_trace?: NonNullable<Json>;
          request_id?: string | null;
          response_id?: string | null;
          run_id?: string | null;
          search_calls?: number;
          status: string;
          trace_object_reference?: string | null;
          user_id: string;
          validation_status?: string;
        };
        Update: {
          actual_cost?: number | null;
          actual_input_tokens?: number | null;
          actual_output_tokens?: number | null;
          cached_input_tokens?: number;
          completed_at?: string | null;
          created_at?: string;
          estimated_cost?: number;
          id?: string;
          model_id?: string | null;
          prompt_version_id?: string | null;
          provider_usage?: NonNullable<Json>;
          reasoning_tokens?: number;
          redacted_trace?: NonNullable<Json>;
          request_id?: string | null;
          response_id?: string | null;
          run_id?: string | null;
          search_calls?: number;
          status?: string;
          trace_object_reference?: string | null;
          user_id?: string;
          validation_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_calls_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'ai_model_catalog';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_calls_prompt_version_id_fkey';
            columns: ['prompt_version_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_calls_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_calls_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_model_catalog: {
        Row: {
          created_at: string;
          default_reasoning: string | null;
          enabled: boolean;
          id: string;
          max_context_tokens: number | null;
          max_output_tokens: number | null;
          model_id: string;
          provider: string;
          supported_tools: string[];
          tier: string;
        };
        Insert: {
          created_at?: string;
          default_reasoning?: string | null;
          enabled?: boolean;
          id?: string;
          max_context_tokens?: number | null;
          max_output_tokens?: number | null;
          model_id: string;
          provider: string;
          supported_tools?: string[];
          tier: string;
        };
        Update: {
          created_at?: string;
          default_reasoning?: string | null;
          enabled?: boolean;
          id?: string;
          max_context_tokens?: number | null;
          max_output_tokens?: number | null;
          model_id?: string;
          provider?: string;
          supported_tools?: string[];
          tier?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          is_allowed: boolean;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          is_allowed?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          is_allowed?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      apple_bridge_devices: {
        Row: {
          created_at: string;
          enabled_lists: string[];
          id: string;
          label: string;
          last_seen_at: string | null;
          revoked_at: string | null;
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled_lists?: string[];
          id?: string;
          label: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled_lists?: string[];
          id?: string;
          label?: string;
          last_seen_at?: string | null;
          revoked_at?: string | null;
          token_hash?: string;
          token_prefix?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'apple_bridge_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      apple_bridge_receipts: {
        Row: {
          device_id: string;
          id: string;
          idempotency_key: string;
          payload_hash: string;
          received_at: string;
        };
        Insert: {
          device_id: string;
          id?: string;
          idempotency_key: string;
          payload_hash: string;
          received_at?: string;
        };
        Update: {
          device_id?: string;
          id?: string;
          idempotency_key?: string;
          payload_hash?: string;
          received_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'apple_bridge_receipts_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'apple_bridge_devices';
            referencedColumns: ['id'];
          },
        ];
      };
      approvals: {
        Row: {
          action_id: string | null;
          decided_at: string | null;
          decision: Database['public']['Enums']['approval_decision'];
          expires_at: string;
          id: string;
          payload_hash: string;
          required_aal: string;
          user_id: string;
        };
        Insert: {
          action_id?: string | null;
          decided_at?: string | null;
          decision?: Database['public']['Enums']['approval_decision'];
          expires_at: string;
          id?: string;
          payload_hash: string;
          required_aal?: string;
          user_id: string;
        };
        Update: {
          action_id?: string | null;
          decided_at?: string | null;
          decision?: Database['public']['Enums']['approval_decision'];
          expires_at?: string;
          id?: string;
          payload_hash?: string;
          required_aal?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approvals_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approvals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      archive_manifests: {
        Row: {
          compression: string;
          created_at: string;
          domain: string;
          id: string;
          max_recorded_at: string | null;
          min_recorded_at: string | null;
          r2_key: string;
          record_count: number;
          schema_version: number;
          sha256: string;
          user_id: string;
          verified_at: string | null;
        };
        Insert: {
          compression: string;
          created_at?: string;
          domain: string;
          id?: string;
          max_recorded_at?: string | null;
          min_recorded_at?: string | null;
          r2_key: string;
          record_count: number;
          schema_version: number;
          sha256: string;
          user_id: string;
          verified_at?: string | null;
        };
        Update: {
          compression?: string;
          created_at?: string;
          domain?: string;
          id?: string;
          max_recorded_at?: string | null;
          min_recorded_at?: string | null;
          r2_key?: string;
          record_count?: number;
          schema_version?: number;
          sha256?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'archive_manifests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      attention_items: {
        Row: {
          acknowledged_at: string | null;
          acknowledgement_required: boolean;
          contract_version: number;
          correlation_id: string;
          created_at: string;
          deadline_at: string | null;
          deduplication_key: string;
          evidence_reference_ids: string[];
          expires_at: string | null;
          finding: string;
          id: string;
          item_type: string;
          priority: number;
          recommended_action: string | null;
          recommended_communication: string;
          resolved_at: string | null;
          source_conversation_id: string | null;
          source_manager_code: string;
          source_run_id: string | null;
          status: Database['public']['Enums']['attention_status'];
          urgency: string;
          user_id: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledgement_required?: boolean;
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          deduplication_key: string;
          evidence_reference_ids?: string[];
          expires_at?: string | null;
          finding: string;
          id?: string;
          item_type: string;
          priority?: number;
          recommended_action?: string | null;
          recommended_communication: string;
          resolved_at?: string | null;
          source_conversation_id?: string | null;
          source_manager_code: string;
          source_run_id?: string | null;
          status?: Database['public']['Enums']['attention_status'];
          urgency?: string;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledgement_required?: boolean;
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          deduplication_key?: string;
          evidence_reference_ids?: string[];
          expires_at?: string | null;
          finding?: string;
          id?: string;
          item_type?: string;
          priority?: number;
          recommended_action?: string | null;
          recommended_communication?: string;
          resolved_at?: string | null;
          source_conversation_id?: string | null;
          source_manager_code?: string;
          source_run_id?: string | null;
          status?: Database['public']['Enums']['attention_status'];
          urgency?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attention_items_source_conversation_id_user_id_fkey';
            columns: ['source_conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'attention_items_source_manager_code_fkey';
            columns: ['source_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'attention_items_source_run_id_user_id_fkey';
            columns: ['source_run_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'attention_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          aal: string | null;
          action_type: string;
          actor_type: string;
          correlation_id: string | null;
          created_at: string;
          id: string;
          redacted_after: Json | null;
          redacted_before: Json | null;
          result: string;
          target_id: string | null;
          target_type: string;
          user_id: string | null;
        };
        Insert: {
          aal?: string | null;
          action_type: string;
          actor_type: string;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          redacted_after?: Json | null;
          redacted_before?: Json | null;
          result: string;
          target_id?: string | null;
          target_type: string;
          user_id?: string | null;
        };
        Update: {
          aal?: string | null;
          action_type?: string;
          actor_type?: string;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          redacted_after?: Json | null;
          redacted_before?: Json | null;
          result?: string;
          target_id?: string | null;
          target_type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      backup_restore_drills: {
        Row: {
          backup_key: string;
          backup_sha256: string;
          created_at: string;
          drill_status: string;
          encrypted: boolean;
          id: string;
          restored_at: string | null;
          user_id: string;
        };
        Insert: {
          backup_key: string;
          backup_sha256: string;
          created_at?: string;
          drill_status?: string;
          encrypted?: boolean;
          id?: string;
          restored_at?: string | null;
          user_id: string;
        };
        Update: {
          backup_key?: string;
          backup_sha256?: string;
          created_at?: string;
          drill_status?: string;
          encrypted?: boolean;
          id?: string;
          restored_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'backup_restore_drills_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_events: {
        Row: {
          all_day: boolean;
          calendar_external_id: string;
          connection_id: string | null;
          created_at: string;
          ends_at: string;
          external_id: string;
          id: string;
          last_modified_at: string;
          location_reference: string | null;
          notes: string | null;
          payload_hash: string;
          recurrence_rule: string | null;
          source: string;
          source_timezone: string;
          starts_at: string;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          all_day?: boolean;
          calendar_external_id: string;
          connection_id?: string | null;
          created_at?: string;
          ends_at: string;
          external_id: string;
          id?: string;
          last_modified_at: string;
          location_reference?: string | null;
          notes?: string | null;
          payload_hash: string;
          recurrence_rule?: string | null;
          source: string;
          source_timezone: string;
          starts_at: string;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          all_day?: boolean;
          calendar_external_id?: string;
          connection_id?: string | null;
          created_at?: string;
          ends_at?: string;
          external_id?: string;
          id?: string;
          last_modified_at?: string;
          location_reference?: string | null;
          notes?: string | null;
          payload_hash?: string;
          recurrence_rule?: string | null;
          source?: string;
          source_timezone?: string;
          starts_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_events_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      career_github_evidence: {
        Row: {
          created_at: string;
          evidence_kind: string;
          id: string;
          owner_login: string;
          payload: NonNullable<Json>;
          repository_external_id: number;
          repository_name: string;
          retrieved_at: string;
          source_url: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          evidence_kind: string;
          id?: string;
          owner_login: string;
          payload?: NonNullable<Json>;
          repository_external_id: number;
          repository_name: string;
          retrieved_at: string;
          source_url: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          evidence_kind?: string;
          id?: string;
          owner_login?: string;
          payload?: NonNullable<Json>;
          repository_external_id?: number;
          repository_name?: string;
          retrieved_at?: string;
          source_url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'career_github_evidence_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      career_goals: {
        Row: {
          created_at: string;
          evidence_plan: NonNullable<Json>;
          id: string;
          status: string;
          target_date: string | null;
          target_role: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          evidence_plan?: NonNullable<Json>;
          id?: string;
          status?: string;
          target_date?: string | null;
          target_role?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          evidence_plan?: NonNullable<Json>;
          id?: string;
          status?: string;
          target_date?: string | null;
          target_role?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'career_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      career_opportunities: {
        Row: {
          created_at: string;
          fit_confidence: number | null;
          id: string;
          organisation: string | null;
          retrieved_at: string;
          source_url: string;
          status: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          fit_confidence?: number | null;
          id?: string;
          organisation?: string | null;
          retrieved_at: string;
          source_url: string;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          fit_confidence?: number | null;
          id?: string;
          organisation?: string | null;
          retrieved_at?: string;
          source_url?: string;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'career_opportunities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      career_skill_evidence: {
        Row: {
          assessed_at: string;
          confidence: number;
          evidence_refs: NonNullable<Json>;
          id: string;
          skill_code: string;
          user_id: string;
        };
        Insert: {
          assessed_at?: string;
          confidence: number;
          evidence_refs: NonNullable<Json>;
          id?: string;
          skill_code: string;
          user_id: string;
        };
        Update: {
          assessed_at?: string;
          confidence?: number;
          evidence_refs?: NonNullable<Json>;
          id?: string;
          skill_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'career_skill_evidence_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      commitments: {
        Row: {
          created_at: string;
          due_at: string | null;
          id: string;
          importance: number;
          status: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          due_at?: string | null;
          id?: string;
          importance?: number;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          due_at?: string | null;
          id?: string;
          importance?: number;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'commitments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      connection_credentials: {
        Row: {
          connection_id: string;
          encrypted_refresh_token: string;
          encryption_key_version: number;
          token_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          connection_id: string;
          encrypted_refresh_token: string;
          encryption_key_version?: number;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          connection_id?: string;
          encrypted_refresh_token?: string;
          encryption_key_version?: number;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connection_credentials_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: true;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
        ];
      };
      connections: {
        Row: {
          account_label: string;
          account_role: string;
          configuration: NonNullable<Json>;
          created_at: string;
          encrypted_credential_reference: string | null;
          environment: string;
          id: string;
          provider: string;
          scopes: string[];
          status: string;
          sync_enabled: boolean;
          user_id: string;
        };
        Insert: {
          account_label: string;
          account_role?: string;
          configuration?: NonNullable<Json>;
          created_at?: string;
          encrypted_credential_reference?: string | null;
          environment?: string;
          id?: string;
          provider: string;
          scopes?: string[];
          status?: string;
          sync_enabled?: boolean;
          user_id: string;
        };
        Update: {
          account_label?: string;
          account_role?: string;
          configuration?: NonNullable<Json>;
          created_at?: string;
          encrypted_credential_reference?: string | null;
          environment?: string;
          id?: string;
          provider?: string;
          scopes?: string[];
          status?: string;
          sync_enabled?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connections_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_attachments: {
        Row: {
          contract_version: number;
          created_at: string;
          data_classification: string;
          extraction_reference: string | null;
          extraction_status: string;
          id: string;
          malware_scan_status: string;
          message_id: string;
          original_filename: string;
          retention_state: string;
          source_object_id: string;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          created_at?: string;
          data_classification: string;
          extraction_reference?: string | null;
          extraction_status?: string;
          id?: string;
          malware_scan_status?: string;
          message_id: string;
          original_filename: string;
          retention_state?: string;
          source_object_id: string;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          created_at?: string;
          data_classification?: string;
          extraction_reference?: string | null;
          extraction_status?: string;
          id?: string;
          malware_scan_status?: string;
          message_id?: string;
          original_filename?: string;
          retention_state?: string;
          source_object_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_attachments_message_id_user_id_fkey';
            columns: ['message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_attachments_source_object_id_user_id_fkey';
            columns: ['source_object_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_attachments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_entity_links: {
        Row: {
          contract_version: number;
          conversation_id: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          message_id: string | null;
          relation: string;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          conversation_id: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          message_id?: string | null;
          relation: string;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          conversation_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          message_id?: string | null;
          relation?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_entity_links_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_entity_links_message_id_user_id_fkey';
            columns: ['message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_entity_links_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_handoff_events: {
        Row: {
          actor_manager_code: string | null;
          contract_version: number;
          correlation_id: string;
          created_at: string;
          handoff_id: string;
          id: string;
          status: Database['public']['Enums']['handoff_status'];
          user_id: string;
        };
        Insert: {
          actor_manager_code?: string | null;
          contract_version?: number;
          correlation_id: string;
          created_at?: string;
          handoff_id: string;
          id?: string;
          status: Database['public']['Enums']['handoff_status'];
          user_id: string;
        };
        Update: {
          actor_manager_code?: string | null;
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          handoff_id?: string;
          id?: string;
          status?: Database['public']['Enums']['handoff_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_handoff_events_actor_manager_code_fkey';
            columns: ['actor_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversation_handoff_events_handoff_id_user_id_fkey';
            columns: ['handoff_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_handoffs';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_handoff_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_handoffs: {
        Row: {
          accepted_at: string | null;
          contract_version: number;
          conversation_id: string;
          correlation_id: string;
          from_manager_code: string;
          id: string;
          idempotency_key: string;
          initiated_at: string;
          reason: string;
          source_message_id: string | null;
          status: Database['public']['Enums']['handoff_status'];
          to_manager_code: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          contract_version?: number;
          conversation_id: string;
          correlation_id?: string;
          from_manager_code: string;
          id?: string;
          idempotency_key: string;
          initiated_at?: string;
          reason: string;
          source_message_id?: string | null;
          status?: Database['public']['Enums']['handoff_status'];
          to_manager_code: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          contract_version?: number;
          conversation_id?: string;
          correlation_id?: string;
          from_manager_code?: string;
          id?: string;
          idempotency_key?: string;
          initiated_at?: string;
          reason?: string;
          source_message_id?: string | null;
          status?: Database['public']['Enums']['handoff_status'];
          to_manager_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_handoffs_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_handoffs_from_manager_code_fkey';
            columns: ['from_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversation_handoffs_source_message_id_user_id_fkey';
            columns: ['source_message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_handoffs_to_manager_code_fkey';
            columns: ['to_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversation_handoffs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_messages: {
        Row: {
          authority: Database['public']['Enums']['conversation_authority'];
          body_reference: string | null;
          body_sha256: string;
          body_text: string | null;
          channel: Database['public']['Enums']['conversation_channel'];
          contract_version: number;
          conversation_id: string;
          correlation_id: string;
          created_at: string;
          deduplication_key: string;
          direction: string;
          gmail_message_id: string | null;
          gmail_rfc_message_id: string | null;
          gmail_thread_id: string | null;
          id: string;
          in_reply_to: string | null;
          manager_code: string | null;
          message_references: string[];
          processing_status: Database['public']['Enums']['conversation_message_status'];
          provider_received_at: string | null;
          semantic_type: string;
          sender_kind: Database['public']['Enums']['conversation_sender_kind'];
          user_id: string;
        };
        Insert: {
          authority: Database['public']['Enums']['conversation_authority'];
          body_reference?: string | null;
          body_sha256: string;
          body_text?: string | null;
          channel: Database['public']['Enums']['conversation_channel'];
          contract_version?: number;
          conversation_id: string;
          correlation_id?: string;
          created_at?: string;
          deduplication_key: string;
          direction: string;
          gmail_message_id?: string | null;
          gmail_rfc_message_id?: string | null;
          gmail_thread_id?: string | null;
          id?: string;
          in_reply_to?: string | null;
          manager_code?: string | null;
          message_references?: string[];
          processing_status?: Database['public']['Enums']['conversation_message_status'];
          provider_received_at?: string | null;
          semantic_type: string;
          sender_kind: Database['public']['Enums']['conversation_sender_kind'];
          user_id: string;
        };
        Update: {
          authority?: Database['public']['Enums']['conversation_authority'];
          body_reference?: string | null;
          body_sha256?: string;
          body_text?: string | null;
          channel?: Database['public']['Enums']['conversation_channel'];
          contract_version?: number;
          conversation_id?: string;
          correlation_id?: string;
          created_at?: string;
          deduplication_key?: string;
          direction?: string;
          gmail_message_id?: string | null;
          gmail_rfc_message_id?: string | null;
          gmail_thread_id?: string | null;
          id?: string;
          in_reply_to?: string | null;
          manager_code?: string | null;
          message_references?: string[];
          processing_status?: Database['public']['Enums']['conversation_message_status'];
          provider_received_at?: string | null;
          semantic_type?: string;
          sender_kind?: Database['public']['Enums']['conversation_sender_kind'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_messages_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_messages_manager_code_fkey';
            columns: ['manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversation_messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_participants: {
        Row: {
          contract_version: number;
          conversation_id: string;
          display_name: string | null;
          id: string;
          joined_at: string;
          kind: string;
          left_at: string | null;
          manager_code: string | null;
          provider_actor_id: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          conversation_id: string;
          display_name?: string | null;
          id?: string;
          joined_at?: string;
          kind: string;
          left_at?: string | null;
          manager_code?: string | null;
          provider_actor_id?: string | null;
          role: string;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          conversation_id?: string;
          display_name?: string | null;
          id?: string;
          joined_at?: string;
          kind?: string;
          left_at?: string | null;
          manager_code?: string | null;
          provider_actor_id?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'conversation_participants_manager_code_fkey';
            columns: ['manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          contract_version: number;
          correlation_id: string;
          created_at: string;
          current_manager_code: string;
          execution_state_summary: NonNullable<Json>;
          gmail_thread_id: string | null;
          id: string;
          last_message_at: string | null;
          metadata: NonNullable<Json>;
          originating_channel: Database['public']['Enums']['conversation_origin_channel'];
          originating_manager_code: string;
          status: Database['public']['Enums']['conversation_status'];
          subject: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          current_manager_code: string;
          execution_state_summary?: NonNullable<Json>;
          gmail_thread_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          metadata?: NonNullable<Json>;
          originating_channel: Database['public']['Enums']['conversation_origin_channel'];
          originating_manager_code: string;
          status?: Database['public']['Enums']['conversation_status'];
          subject: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          current_manager_code?: string;
          execution_state_summary?: NonNullable<Json>;
          gmail_thread_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          metadata?: NonNullable<Json>;
          originating_channel?: Database['public']['Enums']['conversation_origin_channel'];
          originating_manager_code?: string;
          status?: Database['public']['Enums']['conversation_status'];
          subject?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_current_manager_code_fkey';
            columns: ['current_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversations_originating_manager_code_fkey';
            columns: ['originating_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'conversations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      cost_reservations: {
        Row: {
          category: string;
          consumed_amount: number;
          created_at: string;
          estimate_version: number;
          id: string;
          released_amount: number;
          reserved_amount: number;
          run_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          category: string;
          consumed_amount?: number;
          created_at?: string;
          estimate_version?: number;
          id?: string;
          released_amount?: number;
          reserved_amount: number;
          run_id?: string | null;
          status: string;
          user_id: string;
        };
        Update: {
          category?: string;
          consumed_amount?: number;
          created_at?: string;
          estimate_version?: number;
          id?: string;
          released_amount?: number;
          reserved_amount?: number;
          run_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cost_reservations_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cost_reservations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      data_freshness: {
        Row: {
          expected_cadence: string | null;
          id: string;
          last_source_at: string | null;
          last_success_at: string | null;
          last_verification_evidence: NonNullable<Json>;
          last_verified_at: string | null;
          source: string;
          stale_reason: string | null;
          state: string;
          user_id: string;
        };
        Insert: {
          expected_cadence?: string | null;
          id?: string;
          last_source_at?: string | null;
          last_success_at?: string | null;
          last_verification_evidence?: NonNullable<Json>;
          last_verified_at?: string | null;
          source: string;
          stale_reason?: string | null;
          state: string;
          user_id: string;
        };
        Update: {
          expected_cadence?: string | null;
          id?: string;
          last_source_at?: string | null;
          last_success_at?: string | null;
          last_verification_evidence?: NonNullable<Json>;
          last_verified_at?: string | null;
          source?: string;
          stale_reason?: string | null;
          state?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'data_freshness_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      digital_findings: {
        Row: {
          category: string;
          created_at: string;
          evidence: NonNullable<Json>;
          id: string;
          scan_id: string;
          severity: Database['public']['Enums']['risk_class'];
          summary: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          scan_id: string;
          severity: Database['public']['Enums']['risk_class'];
          summary: string;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          evidence?: NonNullable<Json>;
          id?: string;
          scan_id?: string;
          severity?: Database['public']['Enums']['risk_class'];
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'digital_findings_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'digital_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_findings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      digital_inventory_items: {
        Row: {
          classification: string;
          created_at: string;
          duplicate_group: string | null;
          extension: string | null;
          filename: string;
          git_state: string | null;
          id: string;
          mime_type: string | null;
          modified_at: string | null;
          parent_token: string | null;
          path_token: string;
          scan_id: string;
          sha256: string | null;
          size_bytes: number;
          user_id: string;
        };
        Insert: {
          classification?: string;
          created_at?: string;
          duplicate_group?: string | null;
          extension?: string | null;
          filename: string;
          git_state?: string | null;
          id?: string;
          mime_type?: string | null;
          modified_at?: string | null;
          parent_token?: string | null;
          path_token: string;
          scan_id: string;
          sha256?: string | null;
          size_bytes: number;
          user_id: string;
        };
        Update: {
          classification?: string;
          created_at?: string;
          duplicate_group?: string | null;
          extension?: string | null;
          filename?: string;
          git_state?: string | null;
          id?: string;
          mime_type?: string | null;
          modified_at?: string | null;
          parent_token?: string | null;
          path_token?: string;
          scan_id?: string;
          sha256?: string | null;
          size_bytes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'digital_inventory_items_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'digital_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_inventory_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      digital_plans: {
        Row: {
          approved_at: string | null;
          created_at: string;
          device_id: string;
          id: string;
          payload: NonNullable<Json>;
          payload_sha256: string;
          scan_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          device_id: string;
          id?: string;
          payload: NonNullable<Json>;
          payload_sha256: string;
          scan_id: string;
          status?: string;
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          device_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          payload_sha256?: string;
          scan_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'digital_plans_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'worker_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_plans_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'digital_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      digital_scans: {
        Row: {
          approved_roots: NonNullable<Json>;
          completed_at: string | null;
          created_at: string;
          device_id: string;
          id: string;
          inventory_sha256: string | null;
          progress: number;
          result_verified_at: string | null;
          run_id: string | null;
          scan_kind: string;
          started_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          approved_roots: NonNullable<Json>;
          completed_at?: string | null;
          created_at?: string;
          device_id: string;
          id?: string;
          inventory_sha256?: string | null;
          progress?: number;
          result_verified_at?: string | null;
          run_id?: string | null;
          scan_kind: string;
          started_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          approved_roots?: NonNullable<Json>;
          completed_at?: string | null;
          created_at?: string;
          device_id?: string;
          id?: string;
          inventory_sha256?: string | null;
          progress?: number;
          result_verified_at?: string | null;
          run_id?: string | null;
          scan_kind?: string;
          started_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'digital_scans_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'worker_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_scans_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: true;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'digital_scans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      edge_request_windows: {
        Row: {
          operation: string;
          request_count: number;
          user_id: string;
          window_started_at: string;
        };
        Insert: {
          operation: string;
          request_count?: number;
          user_id: string;
          window_started_at: string;
        };
        Update: {
          operation?: string;
          request_count?: number;
          user_id?: string;
          window_started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'edge_request_windows_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      evidence_links: {
        Row: {
          contract_version: number;
          created_at: string;
          entity_id: string;
          entity_type: string;
          evidence_reference_id: string;
          id: string;
          relation: string;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          evidence_reference_id: string;
          id?: string;
          relation?: string;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          evidence_reference_id?: string;
          id?: string;
          relation?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_links_evidence_reference_id_fkey';
            columns: ['evidence_reference_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_references';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'evidence_links_evidence_reference_id_user_id_fkey';
            columns: ['evidence_reference_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'evidence_references';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'evidence_links_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      evidence_references: {
        Row: {
          ai_call_id: string | null;
          captured_at: string | null;
          confidence: string;
          contract_version: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          model_id: string | null;
          prompt_version_id: string | null;
          provenance: NonNullable<Json>;
          research_source_id: string | null;
          retrieved_at: string | null;
          sha256: string | null;
          source_key: string | null;
          source_object_id: string | null;
          source_record_id: string | null;
          source_record_table: string | null;
          source_type: string;
          source_url: string | null;
          title: string;
          trace_event_id: string | null;
          user_id: string;
          verification_method: string;
          workflow_run_id: string | null;
        };
        Insert: {
          ai_call_id?: string | null;
          captured_at?: string | null;
          confidence: string;
          contract_version?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          model_id?: string | null;
          prompt_version_id?: string | null;
          provenance?: NonNullable<Json>;
          research_source_id?: string | null;
          retrieved_at?: string | null;
          sha256?: string | null;
          source_key?: string | null;
          source_object_id?: string | null;
          source_record_id?: string | null;
          source_record_table?: string | null;
          source_type: string;
          source_url?: string | null;
          title: string;
          trace_event_id?: string | null;
          user_id: string;
          verification_method: string;
          workflow_run_id?: string | null;
        };
        Update: {
          ai_call_id?: string | null;
          captured_at?: string | null;
          confidence?: string;
          contract_version?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          model_id?: string | null;
          prompt_version_id?: string | null;
          provenance?: NonNullable<Json>;
          research_source_id?: string | null;
          retrieved_at?: string | null;
          sha256?: string | null;
          source_key?: string | null;
          source_object_id?: string | null;
          source_record_id?: string | null;
          source_record_table?: string | null;
          source_type?: string;
          source_url?: string | null;
          title?: string;
          trace_event_id?: string | null;
          user_id?: string;
          verification_method?: string;
          workflow_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'evidence_references_research_source_id_user_id_fkey';
            columns: ['research_source_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'research_sources';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'evidence_references_source_object_id_user_id_fkey';
            columns: ['source_object_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'evidence_references_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_receipts: {
        Row: {
          action_id: string | null;
          contract_version: number;
          correlation_id: string;
          created_at: string;
          error_code: string | null;
          execution_request_id: string;
          id: string;
          idempotency_key: string;
          kind: string;
          redacted_error: string | null;
          result: NonNullable<Json>;
          result_reference: string | null;
          summary: string;
          user_id: string;
        };
        Insert: {
          action_id?: string | null;
          contract_version?: number;
          correlation_id: string;
          created_at?: string;
          error_code?: string | null;
          execution_request_id: string;
          id?: string;
          idempotency_key: string;
          kind: string;
          redacted_error?: string | null;
          result?: NonNullable<Json>;
          result_reference?: string | null;
          summary: string;
          user_id: string;
        };
        Update: {
          action_id?: string | null;
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          error_code?: string | null;
          execution_request_id?: string;
          id?: string;
          idempotency_key?: string;
          kind?: string;
          redacted_error?: string | null;
          result?: NonNullable<Json>;
          result_reference?: string | null;
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_receipts_action_id_user_id_fkey';
            columns: ['action_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'actions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_receipts_execution_request_id_fkey';
            columns: ['execution_request_id'];
            isOneToOne: false;
            referencedRelation: 'execution_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_receipts_execution_request_id_user_id_fkey';
            columns: ['execution_request_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'execution_requests';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_receipts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_requests: {
        Row: {
          action_id: string | null;
          approval_id: string | null;
          attempt_count: number;
          authority: string;
          cancelled_at: string | null;
          command_type: string;
          command_version: number;
          completed_at: string | null;
          contract_version: number;
          conversation_id: string;
          correlation_id: string;
          created_at: string;
          dependency: string | null;
          error_code: string | null;
          id: string;
          idempotency_key: string;
          intent: string;
          interpreting_manager_code: string;
          mechanism: string;
          redacted_error: string | null;
          required_capability: string;
          result_reference: string | null;
          scope: string;
          source_message_id: string;
          started_at: string | null;
          status: Database['public']['Enums']['execution_request_status'];
          target_reference: string | null;
          target_type: string;
          typed_parameters: NonNullable<Json>;
          user_id: string;
          workflow_run_id: string | null;
        };
        Insert: {
          action_id?: string | null;
          approval_id?: string | null;
          attempt_count?: number;
          authority: string;
          cancelled_at?: string | null;
          command_type: string;
          command_version?: number;
          completed_at?: string | null;
          contract_version?: number;
          conversation_id: string;
          correlation_id?: string;
          created_at?: string;
          dependency?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key: string;
          intent: string;
          interpreting_manager_code: string;
          mechanism: string;
          redacted_error?: string | null;
          required_capability: string;
          result_reference?: string | null;
          scope: string;
          source_message_id: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['execution_request_status'];
          target_reference?: string | null;
          target_type: string;
          typed_parameters?: NonNullable<Json>;
          user_id: string;
          workflow_run_id?: string | null;
        };
        Update: {
          action_id?: string | null;
          approval_id?: string | null;
          attempt_count?: number;
          authority?: string;
          cancelled_at?: string | null;
          command_type?: string;
          command_version?: number;
          completed_at?: string | null;
          contract_version?: number;
          conversation_id?: string;
          correlation_id?: string;
          created_at?: string;
          dependency?: string | null;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string;
          intent?: string;
          interpreting_manager_code?: string;
          mechanism?: string;
          redacted_error?: string | null;
          required_capability?: string;
          result_reference?: string | null;
          scope?: string;
          source_message_id?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['execution_request_status'];
          target_reference?: string | null;
          target_type?: string;
          typed_parameters?: NonNullable<Json>;
          user_id?: string;
          workflow_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_requests_action_id_user_id_fkey';
            columns: ['action_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'actions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_requests_approval_id_user_id_fkey';
            columns: ['approval_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'approvals';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_requests_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_requests_interpreting_manager_code_fkey';
            columns: ['interpreting_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'execution_requests_source_message_id_user_id_fkey';
            columns: ['source_message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_requests_workflow_run_id_user_id_fkey';
            columns: ['workflow_run_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      feedback: {
        Row: {
          categories: string[];
          comment: string | null;
          created_at: string;
          id: string;
          positive: boolean;
          report_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          categories?: string[];
          comment?: string | null;
          created_at?: string;
          id?: string;
          positive: boolean;
          report_id?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          categories?: string[];
          comment?: string | null;
          created_at?: string;
          id?: string;
          positive?: boolean;
          report_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'feedback_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback_categories: {
        Row: {
          active: boolean;
          id: string;
          label: string;
          section_code: string | null;
          workflow_code: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          label: string;
          section_code?: string | null;
          workflow_code: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          label?: string;
          section_code?: string | null;
          workflow_code?: string;
        };
        Relationships: [];
      };
      finance_accounts: {
        Row: {
          account_label: string;
          account_type: string;
          active: boolean;
          created_at: string;
          currency: string;
          external_reference: string | null;
          id: string;
          institution_name: string;
          user_id: string;
        };
        Insert: {
          account_label: string;
          account_type: string;
          active?: boolean;
          created_at?: string;
          currency: string;
          external_reference?: string | null;
          id?: string;
          institution_name: string;
          user_id: string;
        };
        Update: {
          account_label?: string;
          account_type?: string;
          active?: boolean;
          created_at?: string;
          currency?: string;
          external_reference?: string | null;
          id?: string;
          institution_name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_categories: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'finance_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_categories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_close_periods: {
        Row: {
          blockers: NonNullable<Json>;
          close_kind: string;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          readiness: string;
          reconciled: boolean;
          report_id: string | null;
          user_id: string;
        };
        Insert: {
          blockers?: NonNullable<Json>;
          close_kind: string;
          created_at?: string;
          id?: string;
          period_end: string;
          period_start: string;
          readiness?: string;
          reconciled?: boolean;
          report_id?: string | null;
          user_id: string;
        };
        Update: {
          blockers?: NonNullable<Json>;
          close_kind?: string;
          created_at?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          readiness?: string;
          reconciled?: boolean;
          report_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_close_periods_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_close_periods_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_sheet_adapters: {
        Row: {
          configuration: NonNullable<Json>;
          created_at: string;
          id: string;
          read_only: boolean;
          spreadsheet_external_id: string;
          user_id: string;
        };
        Insert: {
          configuration?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          read_only?: boolean;
          spreadsheet_external_id: string;
          user_id: string;
        };
        Update: {
          configuration?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          read_only?: boolean;
          spreadsheet_external_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_sheet_adapters_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_statements: {
        Row: {
          account_id: string | null;
          closing_balance: number | null;
          created_at: string;
          currency: string | null;
          id: string;
          mime_type: string;
          opening_balance: number | null;
          period_end: string | null;
          period_start: string | null;
          sha256: string;
          source: string;
          source_object_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          account_id?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          mime_type: string;
          opening_balance?: number | null;
          period_end?: string | null;
          period_start?: string | null;
          sha256: string;
          source: string;
          source_object_id: string;
          status?: string;
          user_id: string;
        };
        Update: {
          account_id?: string | null;
          closing_balance?: number | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          mime_type?: string;
          opening_balance?: number | null;
          period_end?: string | null;
          period_start?: string | null;
          sha256?: string;
          source?: string;
          source_object_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_statements_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'finance_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_statements_source_object_id_fkey';
            columns: ['source_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_statements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_transactions: {
        Row: {
          account_id: string;
          amount: number;
          balance_after: number | null;
          categorisation_source: string;
          category_id: string | null;
          corrected_from_id: string | null;
          created_at: string;
          currency: string;
          description: string;
          external_id: string | null;
          id: string;
          posted_at: string | null;
          provenance: NonNullable<Json>;
          statement_id: string | null;
          transaction_date: string;
          transaction_hash: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          amount: number;
          balance_after?: number | null;
          categorisation_source?: string;
          category_id?: string | null;
          corrected_from_id?: string | null;
          created_at?: string;
          currency: string;
          description: string;
          external_id?: string | null;
          id?: string;
          posted_at?: string | null;
          provenance?: NonNullable<Json>;
          statement_id?: string | null;
          transaction_date: string;
          transaction_hash: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          balance_after?: number | null;
          categorisation_source?: string;
          category_id?: string | null;
          corrected_from_id?: string | null;
          created_at?: string;
          currency?: string;
          description?: string;
          external_id?: string | null;
          id?: string;
          posted_at?: string | null;
          provenance?: NonNullable<Json>;
          statement_id?: string | null;
          transaction_date?: string;
          transaction_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_transactions_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'finance_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'finance_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_transactions_corrected_from_id_fkey';
            columns: ['corrected_from_id'];
            isOneToOne: false;
            referencedRelation: 'finance_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_transactions_statement_id_fkey';
            columns: ['statement_id'];
            isOneToOne: false;
            referencedRelation: 'finance_statements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_transactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      google_drive_files: {
        Row: {
          checksum: string | null;
          connection_id: string;
          created_at: string;
          deleted_at: string | null;
          drive_file_id: string;
          id: string;
          mime_type: string;
          modified_at: string | null;
          name: string;
          selected: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          checksum?: string | null;
          connection_id: string;
          created_at?: string;
          deleted_at?: string | null;
          drive_file_id: string;
          id?: string;
          mime_type: string;
          modified_at?: string | null;
          name: string;
          selected?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          checksum?: string | null;
          connection_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          drive_file_id?: string;
          id?: string;
          mime_type?: string;
          modified_at?: string | null;
          name?: string;
          selected?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'google_drive_files_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'google_drive_files_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      google_message_attachments: {
        Row: {
          attachment_id: string;
          filename: string;
          id: string;
          message_id: string;
          source_object_id: string | null;
        };
        Insert: {
          attachment_id: string;
          filename: string;
          id?: string;
          message_id: string;
          source_object_id?: string | null;
        };
        Update: {
          attachment_id?: string;
          filename?: string;
          id?: string;
          message_id?: string;
          source_object_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'google_message_attachments_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'google_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'google_message_attachments_source_object_id_fkey';
            columns: ['source_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
        ];
      };
      google_messages: {
        Row: {
          connection_id: string;
          created_at: string;
          deleted_at: string | null;
          gmail_message_id: string;
          id: string;
          internal_at: string;
          label_ids: string[];
          payload_hash: string;
          snippet: string | null;
          thread_id: string;
          user_id: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          deleted_at?: string | null;
          gmail_message_id: string;
          id?: string;
          internal_at: string;
          label_ids?: string[];
          payload_hash: string;
          snippet?: string | null;
          thread_id: string;
          user_id: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          gmail_message_id?: string;
          id?: string;
          internal_at?: string;
          label_ids?: string[];
          payload_hash?: string;
          snippet?: string | null;
          thread_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'google_messages_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'google_messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      google_sync_requests: {
        Row: {
          completed_at: string | null;
          connection_id: string;
          created_at: string;
          error_code: string | null;
          id: string;
          idempotency_key: string;
          request_hash: string;
          response: Json | null;
          status: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          connection_id: string;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key: string;
          request_hash: string;
          response?: Json | null;
          status: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          connection_id?: string;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string;
          request_hash?: string;
          response?: Json | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'google_sync_requests_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'google_sync_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_daily_summaries: {
        Row: {
          calculated_at: string;
          completeness: number;
          data_confidence: string;
          id: string;
          metrics: NonNullable<Json>;
          summary_date: string;
          user_id: string;
        };
        Insert: {
          calculated_at?: string;
          completeness: number;
          data_confidence: string;
          id?: string;
          metrics?: NonNullable<Json>;
          summary_date: string;
          user_id: string;
        };
        Update: {
          calculated_at?: string;
          completeness?: number;
          data_confidence?: string;
          id?: string;
          metrics?: NonNullable<Json>;
          summary_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'health_daily_summaries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_goals: {
        Row: {
          created_at: string;
          id: string;
          metric: string;
          status: string;
          target_date: string | null;
          target_value: number | null;
          unit: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metric: string;
          status?: string;
          target_date?: string | null;
          target_value?: number | null;
          unit: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          metric?: string;
          status?: string;
          target_date?: string | null;
          target_value?: number | null;
          unit?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'health_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_imports: {
        Row: {
          collected_from: string | null;
          collected_to: string | null;
          device_name: string | null;
          id: string;
          idempotency_key: string;
          payload_sha256: string;
          received_at: string;
          source: string;
          source_object_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          collected_from?: string | null;
          collected_to?: string | null;
          device_name?: string | null;
          id?: string;
          idempotency_key: string;
          payload_sha256: string;
          received_at?: string;
          source: string;
          source_object_id?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          collected_from?: string | null;
          collected_to?: string | null;
          device_name?: string | null;
          id?: string;
          idempotency_key?: string;
          payload_sha256?: string;
          received_at?: string;
          source?: string;
          source_object_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'health_imports_source_object_id_fkey';
            columns: ['source_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'health_imports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_plans: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          ends_on: string | null;
          id: string;
          plan_kind: string;
          safety_validated: boolean;
          starts_on: string;
          user_id: string;
        };
        Insert: {
          content?: NonNullable<Json>;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          plan_kind: string;
          safety_validated?: boolean;
          starts_on: string;
          user_id: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          plan_kind?: string;
          safety_validated?: boolean;
          starts_on?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'health_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_rejected_records: {
        Row: {
          created_at: string;
          id: string;
          import_id: string;
          reason: string;
          record_index: number;
          redacted_record: NonNullable<Json>;
        };
        Insert: {
          created_at?: string;
          id?: string;
          import_id: string;
          reason: string;
          record_index: number;
          redacted_record?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          id?: string;
          import_id?: string;
          reason?: string;
          record_index?: number;
          redacted_record?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'health_rejected_records_import_id_fkey';
            columns: ['import_id'];
            isOneToOne: false;
            referencedRelation: 'health_imports';
            referencedColumns: ['id'];
          },
        ];
      };
      health_samples: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          device_name: string | null;
          external_id: string;
          id: string;
          import_id: string | null;
          metric: string;
          observed_at: string;
          original_unit: string | null;
          original_value: number | null;
          provenance: NonNullable<Json>;
          revision: number;
          source: string;
          unit: string;
          user_id: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          device_name?: string | null;
          external_id: string;
          id?: string;
          import_id?: string | null;
          metric: string;
          observed_at: string;
          original_unit?: string | null;
          original_value?: number | null;
          provenance?: NonNullable<Json>;
          revision?: number;
          source: string;
          unit: string;
          user_id: string;
          value: number;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          device_name?: string | null;
          external_id?: string;
          id?: string;
          import_id?: string | null;
          metric?: string;
          observed_at?: string;
          original_unit?: string | null;
          original_value?: number | null;
          provenance?: NonNullable<Json>;
          revision?: number;
          source?: string;
          unit?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'health_samples_import_id_fkey';
            columns: ['import_id'];
            isOneToOne: false;
            referencedRelation: 'health_imports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'health_samples_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      ingestion_batches: {
        Row: {
          checksum: string;
          created_at: string;
          id: string;
          raw_object_id: string | null;
          source: string;
          status: string;
          user_id: string;
        };
        Insert: {
          checksum: string;
          created_at?: string;
          id?: string;
          raw_object_id?: string | null;
          source: string;
          status: string;
          user_id: string;
        };
        Update: {
          checksum?: string;
          created_at?: string;
          id?: string;
          raw_object_id?: string | null;
          source?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingestion_batches_raw_object_id_fkey';
            columns: ['raw_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ingestion_batches_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      integration_cursors: {
        Row: {
          connection_id: string;
          cursor: string | null;
          id: string;
          resource_id: string;
          resource_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          connection_id: string;
          cursor?: string | null;
          id?: string;
          resource_id?: string;
          resource_type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          connection_id?: string;
          cursor?: string | null;
          id?: string;
          resource_id?: string;
          resource_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'integration_cursors_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'integration_cursors_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      inter_agent_replies: {
        Row: {
          contract_version: number;
          correlation_id: string;
          created_at: string;
          evidence_reference_ids: string[];
          id: string;
          kind: string;
          manager_code: string;
          output: NonNullable<Json>;
          request_id: string;
          result_reference: string | null;
          user_id: string;
        };
        Insert: {
          contract_version?: number;
          correlation_id: string;
          created_at?: string;
          evidence_reference_ids?: string[];
          id?: string;
          kind: string;
          manager_code: string;
          output?: NonNullable<Json>;
          request_id: string;
          result_reference?: string | null;
          user_id: string;
        };
        Update: {
          contract_version?: number;
          correlation_id?: string;
          created_at?: string;
          evidence_reference_ids?: string[];
          id?: string;
          kind?: string;
          manager_code?: string;
          output?: NonNullable<Json>;
          request_id?: string;
          result_reference?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inter_agent_replies_manager_code_fkey';
            columns: ['manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'inter_agent_replies_request_id_user_id_fkey';
            columns: ['request_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'inter_agent_requests';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'inter_agent_replies_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      inter_agent_requests: {
        Row: {
          completed_at: string | null;
          context_evidence_ids: string[];
          contract_version: number;
          conversation_id: string | null;
          correlation_id: string;
          created_at: string;
          deadline_at: string | null;
          destination_manager_code: string;
          id: string;
          idempotency_key: string;
          objective: string;
          priority: number;
          required_output_contract: NonNullable<Json>;
          result: Json | null;
          result_reference: string | null;
          source_manager_code: string;
          source_message_id: string | null;
          source_run_id: string | null;
          status: Database['public']['Enums']['inter_agent_request_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          context_evidence_ids?: string[];
          contract_version?: number;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          destination_manager_code: string;
          id?: string;
          idempotency_key: string;
          objective: string;
          priority?: number;
          required_output_contract: NonNullable<Json>;
          result?: Json | null;
          result_reference?: string | null;
          source_manager_code: string;
          source_message_id?: string | null;
          source_run_id?: string | null;
          status?: Database['public']['Enums']['inter_agent_request_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          context_evidence_ids?: string[];
          contract_version?: number;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          destination_manager_code?: string;
          id?: string;
          idempotency_key?: string;
          objective?: string;
          priority?: number;
          required_output_contract?: NonNullable<Json>;
          result?: Json | null;
          result_reference?: string | null;
          source_manager_code?: string;
          source_message_id?: string | null;
          source_run_id?: string | null;
          status?: Database['public']['Enums']['inter_agent_request_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inter_agent_requests_conversation_id_user_id_fkey';
            columns: ['conversation_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'inter_agent_requests_destination_manager_code_fkey';
            columns: ['destination_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'inter_agent_requests_source_manager_code_fkey';
            columns: ['source_manager_code'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'inter_agent_requests_source_message_id_user_id_fkey';
            columns: ['source_message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'conversation_messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'inter_agent_requests_source_run_id_user_id_fkey';
            columns: ['source_run_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'inter_agent_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      job_provider_submissions: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          error_code: string | null;
          expires_at: string;
          job_id: string;
          response_id: string;
          status: string;
          submitted_at: string;
        };
        Insert: {
          attempt_count: number;
          completed_at?: string | null;
          error_code?: string | null;
          expires_at: string;
          job_id: string;
          response_id: string;
          status?: string;
          submitted_at?: string;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          error_code?: string | null;
          expires_at?: string;
          job_id?: string;
          response_id?: string;
          status?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_provider_submissions_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'job_queue';
            referencedColumns: ['id'];
          },
        ];
      };
      job_queue: {
        Row: {
          attempt_count: number;
          available_at: string;
          completed_at: string | null;
          created_at: string;
          deduplication_key: string;
          id: string;
          job_type: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          maximum_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          run_id: string;
          status: Database['public']['Enums']['job_status'];
          user_id: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          completed_at?: string | null;
          created_at?: string;
          deduplication_key: string;
          id?: string;
          job_type: string;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          maximum_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          run_id: string;
          status?: Database['public']['Enums']['job_status'];
          user_id: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          completed_at?: string | null;
          created_at?: string;
          deduplication_key?: string;
          id?: string;
          job_type?: string;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          maximum_attempts?: number;
          payload?: NonNullable<Json>;
          priority?: number;
          run_id?: string;
          status?: Database['public']['Enums']['job_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_queue_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_queue_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      location_preparation_rules: {
        Row: {
          created_at: string;
          id: string;
          location_id: string;
          prepare_before_departure_minutes: number;
          settle_after_arrival_minutes: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          location_id: string;
          prepare_before_departure_minutes?: number;
          settle_after_arrival_minutes?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          location_id?: string;
          prepare_before_departure_minutes?: number;
          settle_after_arrival_minutes?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_preparation_rules_location_id_fkey';
            columns: ['location_id'];
            isOneToOne: false;
            referencedRelation: 'personal_locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_preparation_rules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      location_travel_rules: {
        Row: {
          buffer_percent: number;
          created_at: string;
          destination_location_id: string;
          id: string;
          minimum_buffer_minutes: number;
          normal_minutes: number;
          origin_location_id: string;
          peak_end: string | null;
          peak_minutes: number;
          peak_start: string | null;
          transport_mode: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          buffer_percent?: number;
          created_at?: string;
          destination_location_id: string;
          id?: string;
          minimum_buffer_minutes?: number;
          normal_minutes: number;
          origin_location_id: string;
          peak_end?: string | null;
          peak_minutes: number;
          peak_start?: string | null;
          transport_mode: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          buffer_percent?: number;
          created_at?: string;
          destination_location_id?: string;
          id?: string;
          minimum_buffer_minutes?: number;
          normal_minutes?: number;
          origin_location_id?: string;
          peak_end?: string | null;
          peak_minutes?: number;
          peak_start?: string | null;
          transport_mode?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'location_travel_rules_destination_location_id_fkey';
            columns: ['destination_location_id'];
            isOneToOne: false;
            referencedRelation: 'personal_locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_travel_rules_origin_location_id_fkey';
            columns: ['origin_location_id'];
            isOneToOne: false;
            referencedRelation: 'personal_locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'location_travel_rules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      manager_capabilities: {
        Row: {
          capability_code: string;
          contract_version: number;
          created_at: string;
          enabled: boolean;
          id: string;
          manager_id: string;
          permissions: string[];
        };
        Insert: {
          capability_code: string;
          contract_version: number;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          manager_id: string;
          permissions: string[];
        };
        Update: {
          capability_code?: string;
          contract_version?: number;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          manager_id?: string;
          permissions?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'manager_capabilities_manager_id_fkey';
            columns: ['manager_id'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['id'];
          },
        ];
      };
      managers: {
        Row: {
          code: string;
          configuration: NonNullable<Json>;
          contract_version: number;
          created_at: string;
          description: string;
          enabled: boolean;
          id: string;
          name: string;
          risk_class: Database['public']['Enums']['risk_class'];
          updated_at: string;
        };
        Insert: {
          code: string;
          configuration?: NonNullable<Json>;
          contract_version?: number;
          created_at?: string;
          description: string;
          enabled?: boolean;
          id?: string;
          name: string;
          risk_class?: Database['public']['Enums']['risk_class'];
          updated_at?: string;
        };
        Update: {
          code?: string;
          configuration?: NonNullable<Json>;
          contract_version?: number;
          created_at?: string;
          description?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          risk_class?: Database['public']['Enums']['risk_class'];
          updated_at?: string;
        };
        Relationships: [];
      };
      mfa_action_gates: {
        Row: {
          action_key: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action_key: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action_key?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mfa_action_gates_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mfa_reauthentication_events: {
        Row: {
          created_at: string;
          id: string;
          method: string;
          user_id: string;
          verified_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          method: string;
          user_id: string;
          verified_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          method?: string;
          user_id?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mfa_reauthentication_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_calendar_event_items: {
        Row: {
          adapter_version: string;
          all_day: boolean;
          calendar_name: string;
          created_at: string;
          end_at: string;
          id: string;
          location_text: string;
          notes: string;
          raw_record_id: string;
          start_at: string;
          title: string;
          url: string;
          user_id: string;
        };
        Insert: {
          adapter_version: string;
          all_day: boolean;
          calendar_name: string;
          created_at?: string;
          end_at: string;
          id?: string;
          location_text: string;
          notes: string;
          raw_record_id: string;
          start_at: string;
          title: string;
          url: string;
          user_id: string;
        };
        Update: {
          adapter_version?: string;
          all_day?: boolean;
          calendar_name?: string;
          created_at?: string;
          end_at?: string;
          id?: string;
          location_text?: string;
          notes?: string;
          raw_record_id?: string;
          start_at?: string;
          title?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_calendar_event_items_raw_record_id_fkey';
            columns: ['raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_calendar_event_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_health_sample_items: {
        Row: {
          adapter_version: string;
          created_at: string;
          end_at: string;
          id: string;
          raw_record_id: string;
          reported_duration: string;
          reported_type: string;
          reported_unit: string;
          reported_value: NonNullable<Json>;
          sample_name: string;
          source_name: string;
          start_at: string;
          user_id: string;
        };
        Insert: {
          adapter_version: string;
          created_at?: string;
          end_at: string;
          id?: string;
          raw_record_id: string;
          reported_duration: string;
          reported_type: string;
          reported_unit: string;
          reported_value: NonNullable<Json>;
          sample_name: string;
          source_name: string;
          start_at: string;
          user_id: string;
        };
        Update: {
          adapter_version?: string;
          created_at?: string;
          end_at?: string;
          id?: string;
          raw_record_id?: string;
          reported_duration?: string;
          reported_type?: string;
          reported_unit?: string;
          reported_value?: NonNullable<Json>;
          sample_name?: string;
          source_name?: string;
          start_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_health_sample_items_raw_record_id_fkey';
            columns: ['raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_health_sample_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_health_sample_normalizations: {
        Row: {
          canonical_metric: string | null;
          created_at: string;
          health_sample_id: string;
          id: string;
          normalized_unit: string | null;
          normalized_value: number | null;
          normalizer_version: string;
          status: string;
          user_id: string;
        };
        Insert: {
          canonical_metric?: string | null;
          created_at?: string;
          health_sample_id: string;
          id?: string;
          normalized_unit?: string | null;
          normalized_value?: number | null;
          normalizer_version: string;
          status: string;
          user_id: string;
        };
        Update: {
          canonical_metric?: string | null;
          created_at?: string;
          health_sample_id?: string;
          id?: string;
          normalized_unit?: string | null;
          normalized_value?: number | null;
          normalizer_version?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_health_sample_normalizations_health_sample_id_fkey';
            columns: ['health_sample_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_health_sample_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_health_sample_normalizations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_ingestion_attachments: {
        Row: {
          attachment_id: string;
          byte_size: number;
          id: string;
          mime_type: string;
          received_at: string;
          record_internal_id: string | null;
          snapshot_internal_id: string;
          upload_reference: string;
          user_id: string;
        };
        Insert: {
          attachment_id: string;
          byte_size: number;
          id?: string;
          mime_type: string;
          received_at?: string;
          record_internal_id?: string | null;
          snapshot_internal_id: string;
          upload_reference: string;
          user_id: string;
        };
        Update: {
          attachment_id?: string;
          byte_size?: number;
          id?: string;
          mime_type?: string;
          received_at?: string;
          record_internal_id?: string | null;
          snapshot_internal_id?: string;
          upload_reference?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_ingestion_attachments_record_internal_id_fkey';
            columns: ['record_internal_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_ingestion_attachments_snapshot_internal_id_fkey';
            columns: ['snapshot_internal_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_ingestion_attachments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_ingestion_records: {
        Row: {
          canonical_hash: string;
          external_id: string | null;
          id: string;
          ingest_status: string;
          kind: string | null;
          payload: Json | null;
          raw_record: NonNullable<Json>;
          received_at: string;
          record_id: string | null;
          reject_reason: string | null;
          snapshot_internal_id: string;
          source: string | null;
          source_created_at: string | null;
          source_modified_at: string | null;
          user_id: string;
        };
        Insert: {
          canonical_hash: string;
          external_id?: string | null;
          id?: string;
          ingest_status: string;
          kind?: string | null;
          payload?: Json | null;
          raw_record: NonNullable<Json>;
          received_at?: string;
          record_id?: string | null;
          reject_reason?: string | null;
          snapshot_internal_id: string;
          source?: string | null;
          source_created_at?: string | null;
          source_modified_at?: string | null;
          user_id: string;
        };
        Update: {
          canonical_hash?: string;
          external_id?: string | null;
          id?: string;
          ingest_status?: string;
          kind?: string | null;
          payload?: Json | null;
          raw_record?: NonNullable<Json>;
          received_at?: string;
          record_id?: string | null;
          reject_reason?: string | null;
          snapshot_internal_id?: string;
          source?: string | null;
          source_created_at?: string | null;
          source_modified_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_ingestion_records_snapshot_internal_id_fkey';
            columns: ['snapshot_internal_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_ingestion_records_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_location_observation_items: {
        Row: {
          adapter_version: string;
          altitude: number;
          city: string;
          created_at: string;
          id: string;
          latitude: number;
          longitude: number;
          name: string;
          postcode: string;
          raw_record_id: string;
          region: string;
          state: string;
          street: string;
          user_id: string;
        };
        Insert: {
          adapter_version: string;
          altitude: number;
          city: string;
          created_at?: string;
          id?: string;
          latitude: number;
          longitude: number;
          name: string;
          postcode: string;
          raw_record_id: string;
          region: string;
          state: string;
          street: string;
          user_id: string;
        };
        Update: {
          adapter_version?: string;
          altitude?: number;
          city?: string;
          created_at?: string;
          id?: string;
          latitude?: number;
          longitude?: number;
          name?: string;
          postcode?: string;
          raw_record_id?: string;
          region?: string;
          state?: string;
          street?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_location_observation_items_raw_record_id_fkey';
            columns: ['raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_location_observation_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_record_adaptations: {
        Row: {
          adapter_name: string;
          adapter_version: string;
          correlation_id: string;
          derived_row_id: string | null;
          derived_table: string | null;
          error: string | null;
          id: string;
          processed_at: string;
          record_internal_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          adapter_name: string;
          adapter_version: string;
          correlation_id?: string;
          derived_row_id?: string | null;
          derived_table?: string | null;
          error?: string | null;
          id?: string;
          processed_at?: string;
          record_internal_id: string;
          status: string;
          user_id: string;
        };
        Update: {
          adapter_name?: string;
          adapter_version?: string;
          correlation_id?: string;
          derived_row_id?: string | null;
          derived_table?: string | null;
          error?: string | null;
          id?: string;
          processed_at?: string;
          record_internal_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_record_adaptations_record_internal_id_fkey';
            columns: ['record_internal_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_record_adaptations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_reminder_items: {
        Row: {
          adapter_version: string;
          completion_at: string | null;
          created_at: string;
          due_at: string | null;
          has_subtasks: boolean;
          id: string;
          is_completed: boolean;
          is_flagged: boolean;
          notes: string;
          priority: string;
          raw_record_id: string;
          title: string;
          url: string;
          user_id: string;
        };
        Insert: {
          adapter_version: string;
          completion_at?: string | null;
          created_at?: string;
          due_at?: string | null;
          has_subtasks: boolean;
          id?: string;
          is_completed: boolean;
          is_flagged: boolean;
          notes: string;
          priority: string;
          raw_record_id: string;
          title: string;
          url: string;
          user_id: string;
        };
        Update: {
          adapter_version?: string;
          completion_at?: string | null;
          created_at?: string;
          due_at?: string | null;
          has_subtasks?: boolean;
          id?: string;
          is_completed?: boolean;
          is_flagged?: boolean;
          notes?: string;
          priority?: string;
          raw_record_id?: string;
          title?: string;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_reminder_items_raw_record_id_fkey';
            columns: ['raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_reminder_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_screen_time_activity_items: {
        Row: {
          adapter_version: string;
          created_at: string;
          id: string;
          raw_record_id: string;
          raw_text: string;
          user_id: string;
        };
        Insert: {
          adapter_version: string;
          created_at?: string;
          id?: string;
          raw_record_id: string;
          raw_text: string;
          user_id: string;
        };
        Update: {
          adapter_version?: string;
          created_at?: string;
          id?: string;
          raw_record_id?: string;
          raw_text?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_screen_time_activity_items_raw_record_id_fkey';
            columns: ['raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_screen_time_activity_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_snapshot_sources: {
        Row: {
          client_captured: boolean;
          client_captured_at: string | null;
          client_error: string | null;
          client_record_count: number;
          client_requested: boolean;
          id: string;
          server_accepted_count: number;
          server_received_count: number;
          server_rejected_count: number;
          snapshot_internal_id: string;
          source: string;
          user_id: string;
        };
        Insert: {
          client_captured: boolean;
          client_captured_at?: string | null;
          client_error?: string | null;
          client_record_count: number;
          client_requested: boolean;
          id?: string;
          server_accepted_count: number;
          server_received_count: number;
          server_rejected_count: number;
          snapshot_internal_id: string;
          source: string;
          user_id: string;
        };
        Update: {
          client_captured?: boolean;
          client_captured_at?: string | null;
          client_error?: string | null;
          client_record_count?: number;
          client_requested?: boolean;
          id?: string;
          server_accepted_count?: number;
          server_received_count?: number;
          server_rejected_count?: number;
          snapshot_internal_id?: string;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_snapshot_sources_snapshot_internal_id_fkey';
            columns: ['snapshot_internal_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_snapshot_sources_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_snapshots: {
        Row: {
          accepted_count: number;
          captured_at: string;
          client_type: string;
          client_version: string;
          deferred_count: number;
          device_id: string;
          duplicate_count: number;
          id: string;
          received_at: string;
          received_count: number;
          rejected_count: number;
          request_hash: string;
          request_id: string;
          response_payload: NonNullable<Json>;
          schema_version: number;
          snapshot_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          accepted_count: number;
          captured_at: string;
          client_type: string;
          client_version: string;
          deferred_count: number;
          device_id: string;
          duplicate_count?: number;
          id?: string;
          received_at?: string;
          received_count: number;
          rejected_count: number;
          request_hash: string;
          request_id: string;
          response_payload: NonNullable<Json>;
          schema_version: number;
          snapshot_id: string;
          status: string;
          user_id: string;
        };
        Update: {
          accepted_count?: number;
          captured_at?: string;
          client_type?: string;
          client_version?: string;
          deferred_count?: number;
          device_id?: string;
          duplicate_count?: number;
          id?: string;
          received_at?: string;
          received_count?: number;
          rejected_count?: number;
          request_hash?: string;
          request_id?: string;
          response_payload?: NonNullable<Json>;
          schema_version?: number;
          snapshot_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_snapshots_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'apple_bridge_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_snapshots_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      mobile_typed_deduplication_keys: {
        Row: {
          adapter_name: string;
          adapter_version: string;
          canonical_raw_record_id: string;
          created_at: string;
          deduplication_key: string;
          derived_row_id: string;
          derived_table: string;
          id: string;
          user_id: string;
        };
        Insert: {
          adapter_name: string;
          adapter_version: string;
          canonical_raw_record_id: string;
          created_at?: string;
          deduplication_key: string;
          derived_row_id: string;
          derived_table: string;
          id?: string;
          user_id: string;
        };
        Update: {
          adapter_name?: string;
          adapter_version?: string;
          canonical_raw_record_id?: string;
          created_at?: string;
          deduplication_key?: string;
          derived_row_id?: string;
          derived_table?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mobile_typed_deduplication_keys_canonical_raw_record_id_fkey';
            columns: ['canonical_raw_record_id'];
            isOneToOne: false;
            referencedRelation: 'mobile_ingestion_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mobile_typed_deduplication_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      model_pricing: {
        Row: {
          cache_write_multiplier: number;
          cached_input_per_million: number;
          currency: string;
          effective_from: string;
          id: string;
          input_per_million: number;
          model_id: string;
          output_per_million: number;
          source_url: string;
          verified_at: string;
          web_search_per_call: number;
        };
        Insert: {
          cache_write_multiplier?: number;
          cached_input_per_million: number;
          currency?: string;
          effective_from: string;
          id?: string;
          input_per_million: number;
          model_id: string;
          output_per_million: number;
          source_url: string;
          verified_at: string;
          web_search_per_call?: number;
        };
        Update: {
          cache_write_multiplier?: number;
          cached_input_per_million?: number;
          currency?: string;
          effective_from?: string;
          id?: string;
          input_per_million?: number;
          model_id?: string;
          output_per_million?: number;
          source_url?: string;
          verified_at?: string;
          web_search_per_call?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'model_pricing_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'ai_model_catalog';
            referencedColumns: ['id'];
          },
        ];
      };
      monthly_budgets: {
        Row: {
          actual_on_demand: number;
          actual_recurring: number;
          currency: string;
          id: string;
          locked: boolean;
          month: string;
          provider_backstop: number | null;
          recurring_hard_cap: number;
          recurring_target: number;
          reserve_percentage: number;
          user_id: string;
        };
        Insert: {
          actual_on_demand?: number;
          actual_recurring?: number;
          currency?: string;
          id?: string;
          locked?: boolean;
          month: string;
          provider_backstop?: number | null;
          recurring_hard_cap?: number;
          recurring_target?: number;
          reserve_percentage?: number;
          user_id: string;
        };
        Update: {
          actual_on_demand?: number;
          actual_recurring?: number;
          currency?: string;
          id?: string;
          locked?: boolean;
          month?: string;
          provider_backstop?: number | null;
          recurring_hard_cap?: number;
          recurring_target?: number;
          reserve_percentage?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'monthly_budgets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          attempt_count: number;
          available_at: string;
          body_reference: string | null;
          correlation_id: string | null;
          created_at: string;
          dedupe_key: string;
          gmail_message_id: string | null;
          id: string;
          last_error: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          recipient: string;
          sent_at: string | null;
          status: string;
          subject: string;
          type: string;
          user_id: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          body_reference?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          dedupe_key: string;
          gmail_message_id?: string | null;
          id?: string;
          last_error?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          recipient: string;
          sent_at?: string | null;
          status: string;
          subject: string;
          type: string;
          user_id: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          body_reference?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          dedupe_key?: string;
          gmail_message_id?: string | null;
          id?: string;
          last_error?: string | null;
          lease_expires_at?: string | null;
          lease_owner?: string | null;
          recipient?: string;
          sent_at?: string | null;
          status?: string;
          subject?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      oauth_states: {
        Row: {
          account_role: string;
          consumed_at: string | null;
          created_at: string;
          environment: string;
          expires_at: string;
          id: string;
          pkce_verifier_encrypted: string;
          provider: string;
          redirect_uri: string;
          requested_scopes: string[];
          state_hash: string;
          user_id: string;
        };
        Insert: {
          account_role?: string;
          consumed_at?: string | null;
          created_at?: string;
          environment?: string;
          expires_at: string;
          id?: string;
          pkce_verifier_encrypted: string;
          provider: string;
          redirect_uri: string;
          requested_scopes: string[];
          state_hash: string;
          user_id: string;
        };
        Update: {
          account_role?: string;
          consumed_at?: string | null;
          created_at?: string;
          environment?: string;
          expires_at?: string;
          id?: string;
          pkce_verifier_encrypted?: string;
          provider?: string;
          redirect_uri?: string;
          requested_scopes?: string[];
          state_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'oauth_states_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      on_demand_budgets: {
        Row: {
          actual_amount: number;
          expires_at: string;
          hard_cap: number;
          id: string;
          manager_code: string;
          model_ceiling: string;
          reserved_amount: number;
          run_id: string | null;
          search_ceiling: number;
          status: string;
          user_id: string;
        };
        Insert: {
          actual_amount?: number;
          expires_at: string;
          hard_cap: number;
          id?: string;
          manager_code: string;
          model_ceiling: string;
          reserved_amount?: number;
          run_id?: string | null;
          search_ceiling?: number;
          status?: string;
          user_id: string;
        };
        Update: {
          actual_amount?: number;
          expires_at?: string;
          hard_cap?: number;
          id?: string;
          manager_code?: string;
          model_ceiling?: string;
          reserved_amount?: number;
          run_id?: string | null;
          search_ceiling?: number;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'on_demand_budgets_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: true;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'on_demand_budgets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      on_demand_research_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          hard_cap_minor: number;
          id: string;
          manager_code: string;
          model_ceiling: string;
          report_id: string | null;
          request: NonNullable<Json>;
          reserved_minor: number;
          search_limit: number;
          searches_used: number;
          status: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          hard_cap_minor: number;
          id?: string;
          manager_code: string;
          model_ceiling: string;
          report_id?: string | null;
          request: NonNullable<Json>;
          reserved_minor?: number;
          search_limit: number;
          searches_used?: number;
          status?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          hard_cap_minor?: number;
          id?: string;
          manager_code?: string;
          model_ceiling?: string;
          report_id?: string | null;
          request?: NonNullable<Json>;
          reserved_minor?: number;
          search_limit?: number;
          searches_used?: number;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'on_demand_research_runs_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'on_demand_research_runs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      onboarding_checklist_items: {
        Row: {
          code: string;
          completed_at: string | null;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          code: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          code?: string;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_checklist_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_locations: {
        Row: {
          created_at: string;
          default_preparation_minutes: number;
          default_travel_minutes: number;
          encrypted_address: string;
          id: string;
          label: string;
          location_kind: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_preparation_minutes?: number;
          default_travel_minutes?: number;
          encrypted_address: string;
          id?: string;
          label: string;
          location_kind: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_preparation_minutes?: number;
          default_travel_minutes?: number;
          encrypted_address?: string;
          id?: string;
          label?: string;
          location_kind?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_locations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_plans: {
        Row: {
          created_at: string;
          id: string;
          material_change: boolean;
          plan_date: string;
          plan_kind: string;
          report_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          material_change?: boolean;
          plan_date: string;
          plan_kind: string;
          report_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          material_change?: boolean;
          plan_date?: string;
          plan_kind?: string;
          report_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_plans_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_profiles: {
        Row: {
          career_summary: string | null;
          created_at: string;
          date_of_birth: string | null;
          home_location_id: string | null;
          notification_preferences: NonNullable<Json>;
          planning_preferences: NonNullable<Json>;
          privacy_preferences: NonNullable<Json>;
          updated_at: string;
          user_id: string;
          work_location_id: string | null;
        };
        Insert: {
          career_summary?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          home_location_id?: string | null;
          notification_preferences?: NonNullable<Json>;
          planning_preferences?: NonNullable<Json>;
          privacy_preferences?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
          work_location_id?: string | null;
        };
        Update: {
          career_summary?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          home_location_id?: string | null;
          notification_preferences?: NonNullable<Json>;
          planning_preferences?: NonNullable<Json>;
          privacy_preferences?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
          work_location_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_profiles_home_location_fk';
            columns: ['home_location_id'];
            isOneToOne: false;
            referencedRelation: 'personal_locations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_profiles_work_location_fk';
            columns: ['work_location_id'];
            isOneToOne: false;
            referencedRelation: 'personal_locations';
            referencedColumns: ['id'];
          },
        ];
      };
      planning_exceptions: {
        Row: {
          details: NonNullable<Json>;
          exception_type: string;
          id: string;
          material: boolean;
          occurred_at: string;
          user_id: string;
        };
        Insert: {
          details?: NonNullable<Json>;
          exception_type: string;
          id?: string;
          material?: boolean;
          occurred_at?: string;
          user_id: string;
        };
        Update: {
          details?: NonNullable<Json>;
          exception_type?: string;
          id?: string;
          material?: boolean;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'planning_exceptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      procurement_lifecycle_items: {
        Row: {
          created_at: string;
          id: string;
          item_name: string;
          purchased_at: string | null;
          receipt_source_object_id: string | null;
          recommendation_id: string | null;
          return_deadline: string | null;
          user_id: string;
          vendor: string;
          warranty_expires_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_name: string;
          purchased_at?: string | null;
          receipt_source_object_id?: string | null;
          recommendation_id?: string | null;
          return_deadline?: string | null;
          user_id: string;
          vendor: string;
          warranty_expires_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_name?: string;
          purchased_at?: string | null;
          receipt_source_object_id?: string | null;
          recommendation_id?: string | null;
          return_deadline?: string | null;
          user_id?: string;
          vendor?: string;
          warranty_expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'procurement_lifecycle_items_receipt_source_object_id_fkey';
            columns: ['receipt_source_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'procurement_lifecycle_items_recommendation_id_fkey';
            columns: ['recommendation_id'];
            isOneToOne: false;
            referencedRelation: 'procurement_recommendations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'procurement_lifecycle_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      procurement_recommendations: {
        Row: {
          citations: NonNullable<Json>;
          compliance_passed: boolean;
          created_at: string;
          currency: string | null;
          id: string;
          recommendation_kind: string;
          research_run_id: string;
          returns_summary: string | null;
          title: string;
          total_cost_minor: number | null;
          uncertainty: string;
          user_id: string;
          warranty_summary: string | null;
        };
        Insert: {
          citations: NonNullable<Json>;
          compliance_passed: boolean;
          created_at?: string;
          currency?: string | null;
          id?: string;
          recommendation_kind: string;
          research_run_id: string;
          returns_summary?: string | null;
          title: string;
          total_cost_minor?: number | null;
          uncertainty: string;
          user_id: string;
          warranty_summary?: string | null;
        };
        Update: {
          citations?: NonNullable<Json>;
          compliance_passed?: boolean;
          created_at?: string;
          currency?: string | null;
          id?: string;
          recommendation_kind?: string;
          research_run_id?: string;
          returns_summary?: string | null;
          title?: string;
          total_cost_minor?: number | null;
          uncertainty?: string;
          user_id?: string;
          warranty_summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'procurement_recommendations_research_run_id_fkey';
            columns: ['research_run_id'];
            isOneToOne: false;
            referencedRelation: 'on_demand_research_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'procurement_recommendations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      production_acceptances: {
        Row: {
          accepted_at: string;
          accepted_version: string;
          audit_event_id: string | null;
          created_at: string;
          user_id: string;
        };
        Insert: {
          accepted_at: string;
          accepted_version: string;
          audit_event_id?: string | null;
          created_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_version?: string;
          audit_event_id?: string | null;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'production_acceptances_audit_event_id_fkey';
            columns: ['audit_event_id'];
            isOneToOne: false;
            referencedRelation: 'audit_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'production_acceptances_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_templates: {
        Row: {
          active_version: number | null;
          code: string;
          created_at: string;
          id: string;
          manager_id: string | null;
        };
        Insert: {
          active_version?: number | null;
          code: string;
          created_at?: string;
          id?: string;
          manager_id?: string | null;
        };
        Update: {
          active_version?: number | null;
          code?: string;
          created_at?: string;
          id?: string;
          manager_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_templates_manager_id_fkey';
            columns: ['manager_id'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_versions: {
        Row: {
          developer_text: string;
          evaluation_status: string;
          id: string;
          json_schema: NonNullable<Json>;
          system_text: string;
          template_id: string;
          version: number;
        };
        Insert: {
          developer_text: string;
          evaluation_status?: string;
          id?: string;
          json_schema: NonNullable<Json>;
          system_text: string;
          template_id: string;
          version: number;
        };
        Update: {
          developer_text?: string;
          evaluation_status?: string;
          id?: string;
          json_schema?: NonNullable<Json>;
          system_text?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'prompt_versions_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'prompt_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_usage_reconciliations: {
        Row: {
          calculated_cost: number;
          id: string;
          period_end: string;
          period_start: string;
          provider: string;
          provider_reported_cost: number;
          reconciled_at: string;
          source_reference: string | null;
          status: string;
          user_id: string;
          variance_amount: number | null;
        };
        Insert: {
          calculated_cost: number;
          id?: string;
          period_end: string;
          period_start: string;
          provider: string;
          provider_reported_cost: number;
          reconciled_at?: string;
          source_reference?: string | null;
          status: string;
          user_id: string;
          variance_amount?: never;
        };
        Update: {
          calculated_cost?: number;
          id?: string;
          period_end?: string;
          period_start?: string;
          provider?: string;
          provider_reported_cost?: number;
          reconciled_at?: string;
          source_reference?: string | null;
          status?: string;
          user_id?: string;
          variance_amount?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_usage_reconciliations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      quarantine_items: {
        Row: {
          device_id: string;
          id: string;
          manifest_id: string | null;
          original_path_token: string;
          purge_after: string;
          purged_at: string | null;
          quarantine_path_token: string;
          quarantined_at: string;
          sha256: string;
          user_id: string;
        };
        Insert: {
          device_id: string;
          id?: string;
          manifest_id?: string | null;
          original_path_token: string;
          purge_after?: string;
          purged_at?: string | null;
          quarantine_path_token: string;
          quarantined_at?: string;
          sha256: string;
          user_id: string;
        };
        Update: {
          device_id?: string;
          id?: string;
          manifest_id?: string | null;
          original_path_token?: string;
          purge_after?: string;
          purged_at?: string | null;
          quarantine_path_token?: string;
          quarantined_at?: string;
          sha256?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quarantine_items_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'worker_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quarantine_items_manifest_id_fkey';
            columns: ['manifest_id'];
            isOneToOne: false;
            referencedRelation: 'worker_action_manifests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quarantine_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders: {
        Row: {
          completed_at: string | null;
          created_at: string;
          due_at: string | null;
          external_id: string | null;
          id: string;
          last_modified_at: string;
          list_name: string;
          notes: string | null;
          payload_hash: string;
          priority: number;
          recurrence_rule: string | null;
          source: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          due_at?: string | null;
          external_id?: string | null;
          id?: string;
          last_modified_at: string;
          list_name: string;
          notes?: string | null;
          payload_hash: string;
          priority?: number;
          recurrence_rule?: string | null;
          source?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          due_at?: string | null;
          external_id?: string | null;
          id?: string;
          last_modified_at?: string;
          list_name?: string;
          notes?: string | null;
          payload_hash?: string;
          priority?: number;
          recurrence_rule?: string | null;
          source?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      report_sections: {
        Row: {
          code: string;
          content: string;
          display_order: number;
          evidence_references: NonNullable<Json>;
          id: string;
          report_id: string;
          structured_data: NonNullable<Json>;
          title: string;
        };
        Insert: {
          code: string;
          content: string;
          display_order: number;
          evidence_references?: NonNullable<Json>;
          id?: string;
          report_id: string;
          structured_data?: NonNullable<Json>;
          title: string;
        };
        Update: {
          code?: string;
          content?: string;
          display_order?: number;
          evidence_references?: NonNullable<Json>;
          id?: string;
          report_id?: string;
          structured_data?: NonNullable<Json>;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_sections_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          id: string;
          markdown: string;
          report_type: string;
          run_id: string | null;
          status: string;
          structured_metrics: NonNullable<Json>;
          summary: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          markdown: string;
          report_type: string;
          run_id?: string | null;
          status?: string;
          structured_metrics?: NonNullable<Json>;
          summary: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          markdown?: string;
          report_type?: string;
          run_id?: string | null;
          status?: string;
          structured_metrics?: NonNullable<Json>;
          summary?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: true;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      research_sources: {
        Row: {
          citation_text: string;
          created_at: string;
          domain_area: string;
          expires_at: string | null;
          id: string;
          published_at: string | null;
          retrieved_at: string;
          source_quality: string;
          source_url: string;
          title: string;
          user_id: string;
        };
        Insert: {
          citation_text: string;
          created_at?: string;
          domain_area: string;
          expires_at?: string | null;
          id?: string;
          published_at?: string | null;
          retrieved_at: string;
          source_quality?: string;
          source_url: string;
          title: string;
          user_id: string;
        };
        Update: {
          citation_text?: string;
          created_at?: string;
          domain_area?: string;
          expires_at?: string | null;
          id?: string;
          published_at?: string | null;
          retrieved_at?: string;
          source_quality?: string;
          source_url?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'research_sources_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      routines: {
        Row: {
          active: boolean;
          cadence: string;
          created_at: string;
          id: string;
          preferred_window: NonNullable<Json>;
          title: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          cadence: string;
          created_at?: string;
          id?: string;
          preferred_window?: NonNullable<Json>;
          title: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          cadence?: string;
          created_at?: string;
          id?: string;
          preferred_window?: NonNullable<Json>;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'routines_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      run_step_attempts: {
        Row: {
          attempt_number: number;
          completed_at: string | null;
          duration_ms: number | null;
          id: string;
          redacted_error: string | null;
          run_id: string;
          started_at: string;
          status: Database['public']['Enums']['run_status'];
          step_code: string;
          trace_id: string | null;
        };
        Insert: {
          attempt_number: number;
          completed_at?: string | null;
          duration_ms?: number | null;
          id?: string;
          redacted_error?: string | null;
          run_id: string;
          started_at?: string;
          status: Database['public']['Enums']['run_status'];
          step_code: string;
          trace_id?: string | null;
        };
        Update: {
          attempt_number?: number;
          completed_at?: string | null;
          duration_ms?: number | null;
          id?: string;
          redacted_error?: string | null;
          run_id?: string;
          started_at?: string;
          status?: Database['public']['Enums']['run_status'];
          step_code?: string;
          trace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'run_step_attempts_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      run_steps: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          id: string;
          input_reference: string | null;
          output_reference: string | null;
          redacted_error: string | null;
          retry_metadata: NonNullable<Json>;
          run_id: string;
          sequence: number;
          started_at: string | null;
          status: Database['public']['Enums']['run_status'];
          step_code: string;
          trace_id: string | null;
        };
        Insert: {
          attempt_count?: number;
          completed_at?: string | null;
          id?: string;
          input_reference?: string | null;
          output_reference?: string | null;
          redacted_error?: string | null;
          retry_metadata?: NonNullable<Json>;
          run_id: string;
          sequence: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['run_status'];
          step_code: string;
          trace_id?: string | null;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          id?: string;
          input_reference?: string | null;
          output_reference?: string | null;
          redacted_error?: string | null;
          retry_metadata?: NonNullable<Json>;
          run_id?: string;
          sequence?: number;
          started_at?: string | null;
          status?: Database['public']['Enums']['run_status'];
          step_code?: string;
          trace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'run_steps_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      screen_time_imports: {
        Row: {
          created_at: string;
          id: string;
          source_object_id: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          source_object_id?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          source_object_id?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'screen_time_imports_source_object_id_fkey';
            columns: ['source_object_id'];
            isOneToOne: false;
            referencedRelation: 'source_objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'screen_time_imports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      source_objects: {
        Row: {
          captured_at: string;
          created_at: string;
          data_classification: string;
          id: string;
          mime_type: string;
          r2_key: string;
          sha256: string;
          size_bytes: number;
          source: string;
          user_id: string;
        };
        Insert: {
          captured_at: string;
          created_at?: string;
          data_classification: string;
          id?: string;
          mime_type: string;
          r2_key: string;
          sha256: string;
          size_bytes: number;
          source: string;
          user_id: string;
        };
        Update: {
          captured_at?: string;
          created_at?: string;
          data_classification?: string;
          id?: string;
          mime_type?: string;
          r2_key?: string;
          sha256?: string;
          size_bytes?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'source_objects_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      spend_forecasts: {
        Row: {
          actual_spend: number;
          adjusted_month_end: number;
          calculated_at: string;
          confidence: string;
          expected_completed: number;
          id: string;
          method_version: number;
          month: string;
          original_month_end: number;
          remaining_estimate: number;
          user_id: string;
          variance_factor: number;
        };
        Insert: {
          actual_spend: number;
          adjusted_month_end: number;
          calculated_at?: string;
          confidence: string;
          expected_completed: number;
          id?: string;
          method_version?: number;
          month: string;
          original_month_end: number;
          remaining_estimate: number;
          user_id: string;
          variance_factor: number;
        };
        Update: {
          actual_spend?: number;
          adjusted_month_end?: number;
          calculated_at?: string;
          confidence?: string;
          expected_completed?: number;
          id?: string;
          method_version?: number;
          month?: string;
          original_month_end?: number;
          remaining_estimate?: number;
          user_id?: string;
          variance_factor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'spend_forecasts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      storage_forecasts: {
        Row: {
          archive_bytes: number;
          estimated_monthly_cost_usd: number;
          hot_bytes: number;
          id: string;
          methodology: string;
          recorded_at: string;
          user_id: string;
        };
        Insert: {
          archive_bytes: number;
          estimated_monthly_cost_usd: number;
          hot_bytes: number;
          id?: string;
          methodology: string;
          recorded_at?: string;
          user_id: string;
        };
        Update: {
          archive_bytes?: number;
          estimated_monthly_cost_usd?: number;
          hot_bytes?: number;
          id?: string;
          methodology?: string;
          recorded_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'storage_forecasts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      time_blocks: {
        Row: {
          block_kind: string;
          ends_at: string;
          flexible: boolean;
          id: string;
          plan_id: string;
          source_references: NonNullable<Json>;
          starts_at: string;
          title: string;
        };
        Insert: {
          block_kind: string;
          ends_at: string;
          flexible?: boolean;
          id?: string;
          plan_id: string;
          source_references?: NonNullable<Json>;
          starts_at: string;
          title: string;
        };
        Update: {
          block_kind?: string;
          ends_at?: string;
          flexible?: boolean;
          id?: string;
          plan_id?: string;
          source_references?: NonNullable<Json>;
          starts_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_blocks_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'personal_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      time_preferences: {
        Row: {
          created_at: string;
          guaranteed_busy_windows: NonNullable<Json>;
          id: string;
          maximum_focus_duration_minutes: number;
          minimum_evening_buffer_minutes: number;
          minimum_travel_buffer_minutes: number;
          minimum_unscheduled_buffer_minutes: number;
          preferred_focus_windows: NonNullable<Json>;
          preferred_training_windows: NonNullable<Json>;
          quiet_hours: NonNullable<Json>;
          transport_preferences: NonNullable<Json>;
          travel_buffer_percent: number;
          updated_at: string;
          user_id: string;
          weekday: number;
        };
        Insert: {
          created_at?: string;
          guaranteed_busy_windows?: NonNullable<Json>;
          id?: string;
          maximum_focus_duration_minutes?: number;
          minimum_evening_buffer_minutes?: number;
          minimum_travel_buffer_minutes?: number;
          minimum_unscheduled_buffer_minutes?: number;
          preferred_focus_windows?: NonNullable<Json>;
          preferred_training_windows?: NonNullable<Json>;
          quiet_hours?: NonNullable<Json>;
          transport_preferences?: NonNullable<Json>;
          travel_buffer_percent?: number;
          updated_at?: string;
          user_id: string;
          weekday: number;
        };
        Update: {
          created_at?: string;
          guaranteed_busy_windows?: NonNullable<Json>;
          id?: string;
          maximum_focus_duration_minutes?: number;
          minimum_evening_buffer_minutes?: number;
          minimum_travel_buffer_minutes?: number;
          minimum_unscheduled_buffer_minutes?: number;
          preferred_focus_windows?: NonNullable<Json>;
          preferred_training_windows?: NonNullable<Json>;
          quiet_hours?: NonNullable<Json>;
          transport_preferences?: NonNullable<Json>;
          travel_buffer_percent?: number;
          updated_at?: string;
          user_id?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'time_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      trace_events: {
        Row: {
          correlation_id: string;
          created_at: string;
          event_type: string;
          id: string;
          redacted_payload: NonNullable<Json>;
          severity: string;
          user_id: string;
        };
        Insert: {
          correlation_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          redacted_payload?: NonNullable<Json>;
          severity?: string;
          user_id: string;
        };
        Update: {
          correlation_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          redacted_payload?: NonNullable<Json>;
          severity?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trace_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      travel_watches: {
        Row: {
          active: boolean;
          cadence: string;
          created_at: string;
          expiry_at: string;
          id: string;
          last_trigger_fingerprint: string | null;
          research_run_id: string;
          trigger_threshold: NonNullable<Json>;
          user_id: string;
          watch_kind: string;
        };
        Insert: {
          active?: boolean;
          cadence: string;
          created_at?: string;
          expiry_at: string;
          id?: string;
          last_trigger_fingerprint?: string | null;
          research_run_id: string;
          trigger_threshold?: NonNullable<Json>;
          user_id: string;
          watch_kind: string;
        };
        Update: {
          active?: boolean;
          cadence?: string;
          created_at?: string;
          expiry_at?: string;
          id?: string;
          last_trigger_fingerprint?: string | null;
          research_run_id?: string;
          trigger_threshold?: NonNullable<Json>;
          user_id?: string;
          watch_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'travel_watches_research_run_id_fkey';
            columns: ['research_run_id'];
            isOneToOne: false;
            referencedRelation: 'on_demand_research_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'travel_watches_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      waiting_items: {
        Row: {
          created_at: string;
          due_at: string | null;
          id: string;
          owner: string | null;
          status: string;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          due_at?: string | null;
          id?: string;
          owner?: string | null;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          due_at?: string | null;
          id?: string;
          owner?: string | null;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'waiting_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      webhook_events: {
        Row: {
          external_id: string;
          id: string;
          payload_reference: string | null;
          provider: string;
          received_at: string;
          signature_verified: boolean;
          status: string;
        };
        Insert: {
          external_id: string;
          id?: string;
          payload_reference?: string | null;
          provider: string;
          received_at?: string;
          signature_verified?: boolean;
          status?: string;
        };
        Update: {
          external_id?: string;
          id?: string;
          payload_reference?: string | null;
          provider?: string;
          received_at?: string;
          signature_verified?: boolean;
          status?: string;
        };
        Relationships: [];
      };
      worker_action_manifests: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          device_id: string;
          execution_result: Json | null;
          expires_at: string;
          id: string;
          payload: NonNullable<Json>;
          payload_sha256: string;
          plan_id: string;
          signature_b64: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          device_id: string;
          execution_result?: Json | null;
          expires_at: string;
          id?: string;
          payload: NonNullable<Json>;
          payload_sha256: string;
          plan_id: string;
          signature_b64: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          device_id?: string;
          execution_result?: Json | null;
          expires_at?: string;
          id?: string;
          payload?: NonNullable<Json>;
          payload_sha256?: string;
          plan_id?: string;
          signature_b64?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'worker_action_manifests_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'worker_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'worker_action_manifests_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'digital_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      worker_devices: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          last_heartbeat_at: string | null;
          paired_at: string | null;
          pairing_expires_at: string | null;
          pairing_hash: string | null;
          public_key_b64: string;
          revoked_at: string | null;
          state: string;
          user_id: string;
          worker_secret_hash: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          last_heartbeat_at?: string | null;
          paired_at?: string | null;
          pairing_expires_at?: string | null;
          pairing_hash?: string | null;
          public_key_b64: string;
          revoked_at?: string | null;
          state?: string;
          user_id: string;
          worker_secret_hash?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          last_heartbeat_at?: string | null;
          paired_at?: string | null;
          pairing_expires_at?: string | null;
          pairing_hash?: string | null;
          public_key_b64?: string;
          revoked_at?: string | null;
          state?: string;
          user_id?: string;
          worker_secret_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'worker_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
        ];
      };
      worker_heartbeats: {
        Row: {
          device_id: string;
          id: string;
          received_at: string;
          status: NonNullable<Json>;
          worker_version: string | null;
        };
        Insert: {
          device_id: string;
          id?: string;
          received_at?: string;
          status?: NonNullable<Json>;
          worker_version?: string | null;
        };
        Update: {
          device_id?: string;
          id?: string;
          received_at?: string;
          status?: NonNullable<Json>;
          worker_version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'worker_heartbeats_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'worker_devices';
            referencedColumns: ['id'];
          },
        ];
      };
      workflow_definitions: {
        Row: {
          active: boolean;
          approval_policy: string;
          budget_category: string;
          code: string;
          created_at: string;
          default_model_route: string;
          default_reasoning: string;
          id: string;
          input_schema: NonNullable<Json>;
          manager_id: string;
          notification_policy: string;
          output_schema: NonNullable<Json>;
          required_sources: string[];
          trigger_type: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          approval_policy: string;
          budget_category: string;
          code: string;
          created_at?: string;
          default_model_route: string;
          default_reasoning: string;
          id?: string;
          input_schema?: NonNullable<Json>;
          manager_id: string;
          notification_policy: string;
          output_schema?: NonNullable<Json>;
          required_sources?: string[];
          trigger_type: string;
          version: number;
        };
        Update: {
          active?: boolean;
          approval_policy?: string;
          budget_category?: string;
          code?: string;
          created_at?: string;
          default_model_route?: string;
          default_reasoning?: string;
          id?: string;
          input_schema?: NonNullable<Json>;
          manager_id?: string;
          notification_policy?: string;
          output_schema?: NonNullable<Json>;
          required_sources?: string[];
          trigger_type?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'workflow_definitions_manager_id_fkey';
            columns: ['manager_id'];
            isOneToOne: false;
            referencedRelation: 'managers';
            referencedColumns: ['id'];
          },
        ];
      };
      workflow_runs: {
        Row: {
          budget_reservation_id: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          correlation_id: string;
          error_code: string | null;
          id: string;
          idempotency_key: string;
          priority: number;
          redacted_error: string | null;
          requested_at: string;
          started_at: string | null;
          status: Database['public']['Enums']['run_status'];
          trigger: string;
          user_id: string;
          workflow_definition_id: string;
        };
        Insert: {
          budget_reservation_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          correlation_id?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key: string;
          priority?: number;
          redacted_error?: string | null;
          requested_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['run_status'];
          trigger: string;
          user_id: string;
          workflow_definition_id: string;
        };
        Update: {
          budget_reservation_id?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          correlation_id?: string;
          error_code?: string | null;
          id?: string;
          idempotency_key?: string;
          priority?: number;
          redacted_error?: string | null;
          requested_at?: string;
          started_at?: string | null;
          status?: Database['public']['Enums']['run_status'];
          trigger?: string;
          user_id?: string;
          workflow_definition_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workflow_runs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workflow_runs_workflow_definition_id_fkey';
            columns: ['workflow_definition_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
      workflow_schedules: {
        Row: {
          catch_up_policy: string;
          created_at: string;
          cron_expression: string;
          enabled: boolean;
          id: string;
          maximum_lateness: string;
          next_due_at: string | null;
          priority: number;
          timezone: string;
          user_id: string;
          workflow_definition_id: string;
        };
        Insert: {
          catch_up_policy?: string;
          created_at?: string;
          cron_expression: string;
          enabled?: boolean;
          id?: string;
          maximum_lateness?: string;
          next_due_at?: string | null;
          priority?: number;
          timezone?: string;
          user_id: string;
          workflow_definition_id: string;
        };
        Update: {
          catch_up_policy?: string;
          created_at?: string;
          cron_expression?: string;
          enabled?: boolean;
          id?: string;
          maximum_lateness?: string;
          next_due_at?: string | null;
          priority?: number;
          timezone?: string;
          user_id?: string;
          workflow_definition_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workflow_schedules_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'app_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workflow_schedules_workflow_definition_id_fkey';
            columns: ['workflow_definition_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      adapt_mobile_record_v1: { Args: { p_record_id: string }; Returns: string };
      adapt_mobile_snapshot: {
        Args: { p_snapshot_id: string; p_token_hash: string };
        Returns: Json;
      };
      add_model_pricing: {
        Args: {
          p_cached_input: number;
          p_effective_from: string;
          p_input: number;
          p_model_id: string;
          p_output: number;
          p_source_url: string;
          p_user_id: string;
        };
        Returns: {
          cache_write_multiplier: number;
          cached_input_per_million: number;
          currency: string;
          effective_from: string;
          id: string;
          input_per_million: number;
          model_id: string;
          output_per_million: number;
          source_url: string;
          verified_at: string;
          web_search_per_call: number;
        };
        SetofOptions: {
          from: '*';
          to: 'model_pricing';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      calculate_instrumented_ai_cost: {
        Args: {
          p_cached_input_tokens: number;
          p_input_tokens: number;
          p_model_id: string;
          p_output_tokens: number;
          p_search_calls: number;
        };
        Returns: number;
      };
      calculate_spend_forecast: {
        Args: { p_month?: string; p_user_id: string };
        Returns: {
          actual_spend: number;
          adjusted_month_end: number;
          calculated_at: string;
          confidence: string;
          expected_completed: number;
          id: string;
          method_version: number;
          month: string;
          original_month_end: number;
          remaining_estimate: number;
          user_id: string;
          variance_factor: number;
        };
        SetofOptions: {
          from: '*';
          to: 'spend_forecasts';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_queued_run: { Args: { p_run_id: string; p_user_id: string }; Returns: boolean };
      claim_job_queue: {
        Args: { p_limit?: number; p_worker_id: string };
        Returns: {
          attempt_count: number;
          available_at: string;
          completed_at: string | null;
          created_at: string;
          deduplication_key: string;
          id: string;
          job_type: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          maximum_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          run_id: string;
          status: Database['public']['Enums']['job_status'];
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'job_queue';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_notification_delivery: {
        Args: { p_limit?: number; p_worker_id: string };
        Returns: {
          attempt_count: number;
          available_at: string;
          body_reference: string | null;
          correlation_id: string | null;
          created_at: string;
          dedupe_key: string;
          gmail_message_id: string | null;
          id: string;
          last_error: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          recipient: string;
          sent_at: string | null;
          status: string;
          subject: string;
          type: string;
          user_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'notifications';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_deterministic_workflow_run: { Args: { p_run_id: string }; Returns: string };
      complete_job_queue:
        | {
            Args: {
              p_job_id: string;
              p_outcome: string;
              p_redacted_error?: string;
              p_worker_id: string;
            };
            Returns: {
              attempt_count: number;
              available_at: string;
              completed_at: string | null;
              created_at: string;
              deduplication_key: string;
              id: string;
              job_type: string;
              lease_expires_at: string | null;
              lease_owner: string | null;
              maximum_attempts: number;
              payload: NonNullable<Json>;
              priority: number;
              run_id: string;
              status: Database['public']['Enums']['job_status'];
              user_id: string;
            };
            SetofOptions: {
              from: '*';
              to: 'job_queue';
              isOneToOne: true;
              isSetofReturn: false;
            };
          }
        | {
            Args: {
              p_job_id: string;
              p_redacted_error?: string;
              p_succeeded: boolean;
              p_worker_id: string;
            };
            Returns: {
              attempt_count: number;
              available_at: string;
              completed_at: string | null;
              created_at: string;
              deduplication_key: string;
              id: string;
              job_type: string;
              lease_expires_at: string | null;
              lease_owner: string | null;
              maximum_attempts: number;
              payload: NonNullable<Json>;
              priority: number;
              run_id: string;
              status: Database['public']['Enums']['job_status'];
              user_id: string;
            };
            SetofOptions: {
              from: '*';
              to: 'job_queue';
              isOneToOne: true;
              isSetofReturn: false;
            };
          };
      complete_notification_delivery: {
        Args: {
          p_error?: string;
          p_gmail_message_id?: string;
          p_notification_id: string;
          p_worker_id: string;
        };
        Returns: {
          attempt_count: number;
          available_at: string;
          body_reference: string | null;
          correlation_id: string | null;
          created_at: string;
          dedupe_key: string;
          gmail_message_id: string | null;
          id: string;
          last_error: string | null;
          lease_expires_at: string | null;
          lease_owner: string | null;
          recipient: string;
          sent_at: string | null;
          status: string;
          subject: string;
          type: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'notifications';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_provider_queue_job: {
        Args: { p_error_code?: string; p_job_id: string; p_outcome: string; p_response_id: string };
        Returns: {
          attempt_count: number;
          available_at: string;
          completed_at: string | null;
          created_at: string;
          deduplication_key: string;
          id: string;
          job_type: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          maximum_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          run_id: string;
          status: Database['public']['Enums']['job_status'];
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'job_queue';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      consume_edge_request_quota: {
        Args: { p_limit?: number; p_operation: string; p_user_id: string };
        Returns: boolean;
      };
      consume_mfa_action_gate: {
        Args: { p_action_key: string; p_gate_id: string };
        Returns: boolean;
      };
      create_apple_bridge_device_from_mfa_gate: {
        Args: {
          p_enabled_lists: string[];
          p_gate_id: string;
          p_label: string;
          p_token_hash: string;
          p_token_prefix: string;
        };
        Returns: {
          created_at: string;
          enabled_lists: string[];
          id: string;
          label: string;
        }[];
      };
      create_mfa_action_gate: { Args: { p_action_key: string }; Returns: string };
      create_on_demand_run: {
        Args: {
          p_hard_cap: number;
          p_idempotency_key: string;
          p_manager_code: string;
          p_model_ceiling: string;
          p_search_ceiling: number;
          p_user_id: string;
          p_workflow_id: string;
        };
        Returns: string;
      };
      create_on_demand_run_request: {
        Args: {
          p_hard_cap: number;
          p_idempotency_key: string;
          p_manager_code: string;
          p_model_ceiling: string;
          p_request: Json;
          p_search_ceiling: number;
          p_user_id: string;
          p_workflow_id: string;
        };
        Returns: string;
      };
      create_worker_device_from_mfa_gate: {
        Args: {
          p_gate_id: string;
          p_label: string;
          p_pairing_expires_at: string;
          p_pairing_hash: string;
          p_public_key_b64: string;
        };
        Returns: {
          device_id: string;
          pairing_expires_at: string;
        }[];
      };
      decide_approval: {
        Args: {
          p_approval_id: string;
          p_decision: Database['public']['Enums']['approval_decision'];
          p_note?: string;
          p_user_id: string;
        };
        Returns: {
          action_id: string | null;
          decided_at: string | null;
          decision: Database['public']['Enums']['approval_decision'];
          expires_at: string;
          id: string;
          payload_hash: string;
          required_aal: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approvals';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      dispatch_due_schedules: {
        Args: { p_now?: string };
        Returns: {
          correlation_id: string;
          run_id: string;
          user_id: string;
        }[];
      };
      execute_career_travel_procurement_workflow: { Args: { p_run_id: string }; Returns: string };
      execute_digital_estate_workflow: { Args: { p_run_id: string }; Returns: string };
      execute_health_finance_workflow: { Args: { p_run_id: string }; Returns: string };
      execute_personal_workflow: { Args: { p_run_id: string }; Returns: string };
      execute_systems_workflow: { Args: { p_run_id: string }; Returns: string };
      ingest_apple_bridge_snapshot: {
        Args: {
          p_events: Json;
          p_idempotency_key: string;
          p_payload_hash: string;
          p_reminders: Json;
          p_token_hash: string;
        };
        Returns: Json;
      };
      ingest_mobile_snapshot: {
        Args: {
          p_captured_at: string;
          p_client_type: string;
          p_client_version: string;
          p_records: Json;
          p_request_hash: string;
          p_request_id: string;
          p_schema_version: number;
          p_snapshot_id: string;
          p_sources: Json;
          p_token_hash: string;
        };
        Returns: Json;
      };
      is_allowed_aal2: { Args: Record<PropertyKey, never>; Returns: boolean };
      mark_instrumented_ai_call_submitted: {
        Args: { p_call_id: string; p_response_id: string };
        Returns: undefined;
      };
      mobile_adapter_validation_issues: {
        Args: { p_adapter: string; p_payload: Json; p_reason: string };
        Returns: Json;
      };
      mobile_is_valid_optional_offset_timestamp: { Args: { p_value: string }; Returns: boolean };
      mobile_parse_offset_timestamp: {
        Args: { p_allow_empty?: boolean; p_value: string };
        Returns: string;
      };
      mobile_shortcut_numeric: { Args: { p_field: string; p_payload: Json }; Returns: number };
      mobile_typed_deduplication_key: {
        Args: { p_canonical_hash: string; p_external_id: string; p_source_modified_at: string };
        Returns: string;
      };
      production_onboarding_complete: { Args: { p_user_id: string }; Returns: boolean };
      promote_mobile_health_snapshot: {
        Args: { p_snapshot_id: string; p_token_hash: string };
        Returns: Json;
      };
      promote_mobile_health_snapshot_internal: {
        Args: { p_snapshot_internal_id: string };
        Returns: Json;
      };
      record_instrumented_ai_reconciliation_failure: {
        Args: { p_call_id: string; p_error_code: string; p_redacted_trace?: Json };
        Returns: undefined;
      };
      record_provider_usage_reconciliation: {
        Args: {
          p_period_end: string;
          p_period_start: string;
          p_reported_cost: number;
          p_source_reference?: string;
          p_user_id: string;
        };
        Returns: {
          calculated_cost: number;
          id: string;
          period_end: string;
          period_start: string;
          provider: string;
          provider_reported_cost: number;
          reconciled_at: string;
          source_reference: string | null;
          status: string;
          user_id: string;
          variance_amount: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'provider_usage_reconciliations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_source_freshness: {
        Args: {
          p_evidence: Json;
          p_expected_cadence: string;
          p_last_source_at: string;
          p_last_success_at: string;
          p_source: string;
          p_stale_reason: string;
          p_state: string;
          p_user_id: string;
        };
        Returns: {
          expected_cadence: string | null;
          id: string;
          last_source_at: string | null;
          last_success_at: string | null;
          last_verification_evidence: NonNullable<Json>;
          last_verified_at: string | null;
          source: string;
          stale_reason: string | null;
          state: string;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'data_freshness';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reserve_instrumented_ai_call: {
        Args: {
          p_estimated_cost: number;
          p_model_id: string;
          p_prompt_version_id: string;
          p_redacted_trace?: Json;
          p_request_id: string;
          p_run_id: string;
          p_user_id: string;
        };
        Returns: string;
      };
      reserve_recurring_budget: {
        Args: { p_amount: number; p_run_id: string; p_user_id: string };
        Returns: string;
      };
      revoke_apple_bridge_device: {
        Args: { p_device_id: string; p_gate_id: string };
        Returns: Json;
      };
      revoke_worker_device_from_mfa_gate: {
        Args: { p_device_id: string; p_gate_id: string };
        Returns: Json;
      };
      settle_instrumented_ai_call: {
        Args: {
          p_actual_cost: number;
          p_cached_input_tokens: number;
          p_call_id: string;
          p_input_tokens: number;
          p_output_tokens: number;
          p_provider_usage: Json;
          p_reasoning_tokens: number;
          p_redacted_trace: Json;
          p_search_calls: number;
          p_validation_passed: boolean;
        };
        Returns: {
          actual_cost: number | null;
          actual_input_tokens: number | null;
          actual_output_tokens: number | null;
          cached_input_tokens: number;
          completed_at: string | null;
          created_at: string;
          estimated_cost: number;
          id: string;
          model_id: string | null;
          prompt_version_id: string | null;
          provider_usage: NonNullable<Json>;
          reasoning_tokens: number;
          redacted_trace: NonNullable<Json>;
          request_id: string | null;
          response_id: string | null;
          run_id: string | null;
          search_calls: number;
          status: string;
          trace_object_reference: string | null;
          user_id: string;
          validation_status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'ai_calls';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_workflow_job_response: {
        Args: { p_response_id: string; p_run_id: string };
        Returns: {
          attempt_count: number;
          available_at: string;
          completed_at: string | null;
          created_at: string;
          deduplication_key: string;
          id: string;
          job_type: string;
          lease_expires_at: string | null;
          lease_owner: string | null;
          maximum_attempts: number;
          payload: NonNullable<Json>;
          priority: number;
          run_id: string;
          status: Database['public']['Enums']['job_status'];
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'job_queue';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_google_source_selection: {
        Args: {
          p_connection_id: string;
          p_gate_id: string;
          p_selected_calendar_ids: string[];
          p_selected_drive_file_ids: string[];
        };
        Returns: Json;
      };
      update_onboarding_checklist_item: {
        Args: { p_code: string; p_completed_at: string; p_metadata?: Json; p_user_id: string };
        Returns: undefined;
      };
      commit_instrumented_ai_report: {
        Args: {
          p_actions: Json;
          p_actual_cost: number;
          p_cached_input_tokens: number;
          p_call_id: string;
          p_input_tokens: number;
          p_markdown: string;
          p_notification_policy: string;
          p_output_tokens: number;
          p_provider_usage: Json;
          p_reasoning_tokens: number;
          p_redacted_trace: Json;
          p_report_type: string;
          p_sections: Json;
          p_structured_metrics: Json;
          p_summary: string;
          p_title: string;
        };
        Returns: string;
      };
      commit_instrumented_ai_report_with_queue: {
        Args: {
          p_actions: Json;
          p_actual_cost: number;
          p_cached_input_tokens: number;
          p_call_id: string;
          p_input_tokens: number;
          p_job_id: string;
          p_markdown: string;
          p_notification_policy: string;
          p_output_tokens: number;
          p_provider_usage: Json;
          p_reasoning_tokens: number;
          p_redacted_trace: Json;
          p_report_type: string;
          p_response_id: string;
          p_sections: Json;
          p_structured_metrics: Json;
          p_summary: string;
          p_title: string;
        };
        Returns: string;
      };
      fail_instrumented_ai_provider_response: {
        Args: {
          p_actual_cost: number;
          p_cached_input_tokens: number;
          p_call_id: string;
          p_error_code: string;
          p_input_tokens: number;
          p_job_id: string;
          p_output_tokens: number;
          p_provider_usage: Json;
          p_reasoning_tokens: number;
          p_redacted_trace: Json;
          p_response_id: string;
        };
        Returns: boolean;
      };
      record_workflow_stage: {
        Args: {
          p_input_reference?: string;
          p_output_reference?: string;
          p_redacted_error?: string;
          p_run_id: string;
          p_sequence: number;
          p_status: string;
          p_step_code: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      approval_decision: 'pending' | 'approved' | 'rejected' | 'expired';
      attention_status:
        | 'new'
        | 'queued_for_planner'
        | 'incorporated'
        | 'sent_immediately'
        | 'dismissed'
        | 'expired'
        | 'resolved';
      conversation_authority:
        | 'verified_user'
        | 'agent_generated'
        | 'system_generated'
        | 'external_untrusted';
      conversation_channel: 'gmail' | 'web_chat' | 'internal';
      conversation_message_status:
        | 'received'
        | 'queued'
        | 'routing'
        | 'processing'
        | 'processed'
        | 'failed'
        | 'ignored';
      conversation_origin_channel: 'gmail' | 'web_chat';
      conversation_sender_kind: 'user' | 'manager' | 'system' | 'external';
      conversation_status: 'open' | 'closed' | 'archived';
      execution_request_status:
        | 'received'
        | 'routed'
        | 'queued'
        | 'running'
        | 'waiting_for_dependency'
        | 'succeeded'
        | 'failed'
        | 'cancelled';
      handoff_status: 'requested' | 'accepted' | 'rejected' | 'cancelled';
      inter_agent_request_status:
        | 'requested'
        | 'accepted'
        | 'running'
        | 'waiting_for_dependency'
        | 'completed'
        | 'rejected'
        | 'failed'
        | 'cancelled';
      job_status:
        | 'queued'
        | 'leased'
        | 'succeeded'
        | 'dead_letter'
        | 'cancelled'
        | 'awaiting_provider';
      risk_class: 'low' | 'medium' | 'high' | 'critical';
      run_status:
        | 'queued'
        | 'running'
        | 'waiting_for_dependency'
        | 'succeeded'
        | 'failed'
        | 'cancelled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      approval_decision: ['pending', 'approved', 'rejected', 'expired'],
      attention_status: [
        'new',
        'queued_for_planner',
        'incorporated',
        'sent_immediately',
        'dismissed',
        'expired',
        'resolved',
      ],
      conversation_authority: [
        'verified_user',
        'agent_generated',
        'system_generated',
        'external_untrusted',
      ],
      conversation_channel: ['gmail', 'web_chat', 'internal'],
      conversation_message_status: [
        'received',
        'queued',
        'routing',
        'processing',
        'processed',
        'failed',
        'ignored',
      ],
      conversation_origin_channel: ['gmail', 'web_chat'],
      conversation_sender_kind: ['user', 'manager', 'system', 'external'],
      conversation_status: ['open', 'closed', 'archived'],
      execution_request_status: [
        'received',
        'routed',
        'queued',
        'running',
        'waiting_for_dependency',
        'succeeded',
        'failed',
        'cancelled',
      ],
      handoff_status: ['requested', 'accepted', 'rejected', 'cancelled'],
      inter_agent_request_status: [
        'requested',
        'accepted',
        'running',
        'waiting_for_dependency',
        'completed',
        'rejected',
        'failed',
        'cancelled',
      ],
      job_status: [
        'queued',
        'leased',
        'succeeded',
        'dead_letter',
        'cancelled',
        'awaiting_provider',
      ],
      risk_class: ['low', 'medium', 'high', 'critical'],
      run_status: [
        'queued',
        'running',
        'waiting_for_dependency',
        'succeeded',
        'failed',
        'cancelled',
      ],
    },
  },
} as const;
