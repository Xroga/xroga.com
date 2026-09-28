
                authorization: {
                  /*
                   * business.action can only
                   * reach this branch when the
                   * semantic planner selected it
                   * from the user's current
                   * explicit request.
                   */
                  explicitUserAuthorization:
                    true,
                },
              },
            );
        } catch (error) {
          throw businessRuntimeFailure(
            error,

            'Xroga Connect could not complete the requested connected-app action.',
          );
        }

        if (
          execution.status ===
          'confirmation_required'
        ) {
          const confirmation =
            await createBusinessActionConfirmation(
              userId,

              execution.plan,
            );

          const usage =
            await getUsage(
              userId,
            );

          const confirmationUi =
            toolUiLink(
              {
                version: 1,

                type:
                  'confirmation_required',

                task:
                  message.trim(),

                title:
                  'Confirm external action',

                message:
                  'Review this connected-app action before Xroga executes it.',

                confirmationId:
                  confirmation.id,

                summary:
                  confirmation.summary,

                toolkit:
                  confirmation.toolkit,

                risk:
                  confirmation.risk,

                expiresAt:
                  confirmation.expiresAt,
              },
            );

          return res.json(
            {
              response:
                `${execution.message}\n\n` +
                'Nothing has been changed yet.\n\n' +
                `[Review action](${confirmationUi})`,

              intent:
                'business_action_confirmation_required',

              usage:
                usageToTokenUsage(
                  usage,
                ),

              webSources:
                [],

              engine:
                'xroga',

              businessAction:
                true,

              businessActionConfirmationRequired:
                true,

              businessActionConfirmationId:
                confirmation.id,

              businessActionSummary:
                confirmation.summary,

              businessActionRisk:
                confirmation.risk,

              businessActionToolkit:
                confirmation.toolkit,

              businessActionExpiresAt:
                confirmation.expiresAt,
            },
          );
        }

        const usage =
          await getUsage(
            userId,
          );

        const appName =
          displayToolkitName(
            execution.toolkit,
          );

        /*
         * Do not send a successful action
         * through a second language-model
         * turn. The server already has
         * authoritative execution evidence;
         * a deterministic acknowledgement
         * prevents duplicate-action wording,
         * web-research contamination and
         * prompt injection from provider
         * result data.
         */
        return res.json(
          {
            response:
              `Done — ${prepared.plan.summary}\n\n` +
              `${appName} confirmed the action completed.`,

            intent:
              'business_action_completed',

            usage:
              usageToTokenUsage(
                usage,
              ),

            webSources:
              [],

            engine:
              'xroga',

            businessAction:
              true,
