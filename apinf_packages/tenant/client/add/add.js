/* Copyright 2019 Apinf Oy
This file is covered by the EUPL license.
You may obtain a copy of the licence at
https://joinup.ec.europa.eu/community/eupl/og_page/european-union-public-licence-eupl-v11 */

// Meteor packages imports
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { sAlert } from 'meteor/juliancwirko:s-alert';
import { Modal } from 'meteor/peppelg:bootstrap-3-modal';
import { TAPi18n } from 'meteor/tap:i18n';

Template.tenantForm.onCreated(() => {
  // Turn off spinner if it was on
  Session.set('tenantUpdateOngoing', false);
});

Template.tenantForm.onDestroyed(() => {
  // Unset sessions
  Session.set('tenantUpdateOngoing', undefined);
});

Template.tenantForm.events({
  'click #save-tenant': function () {
    if ($('#add-tenant-name').val() === '') {
      sAlert.error('Tenant must have a name!', { timeout: 'none' });
    } else if ($('#add-tenant-description').val() === '') {
      sAlert.error('Tenant must have a description!', { timeout: 'none' });
    } else {
      // Save new Tenant operation began, inform spinner
      Session.set('tenantUpdateOngoing', true);

      const tenant = {};
      let tenantUsers = [];
      let notifyUserList = [];

      tenant.name = $('#add-tenant-name').val();
      tenant.description = $('#add-tenant-description').val();

      // Get possible users in tenant
      if (Session.get('tenantUsers')) {
        tenantUsers = Session.get('tenantUsers');
        console.log('tenant users=', tenantUsers);
        // convert user objects to a list for POST operation
        tenant.users = tenantUsers.map((userdata) => {
          const usersRow = {
            id: userdata.id,
            name: userdata.name,
            provider: userdata.provider === 'checked' ? 'data-provider' : false,
            consumer: userdata.consumer === 'checked' ? 'data-consumer' : false,
          };
          return usersRow;
        });
        // gather list of notified users email addresses
        notifyUserList = tenantUsers.filter((userdata) => {
      //    if (userdata.notification === 'checked') {
            return {
              username: userdata.name,
              email: userdata.email,
            }
      //    }
      //    return false;
        });
      }

      // Set local tenant list empty
      let tenantList = [];

      // POST /tenant
      Meteor.call('addTenant', tenant, (error, result) => {
        if (result) {
          if (result.status === 201) {
            // In successful case we can empty the input fields

            // Empty the tenant user list
            tenantUsers.splice(0, tenantUsers.length);
            // Remove users from session
            Session.set('tenantUsers', tenantUsers);

            // Empty tenant name field
            $('#add-tenant-name').val('');
            // Empty tenant description field
            $('#add-tenant-description').val('');

            // Operation finished, inform spinner
            Session.set('tenantUpdateOngoing', false);

            // New tenant successfully added on manager side, empty local list
            tenantList = [];
            // Save to sessionStorage to be used while adding users to tenant
            Session.set('tenantList', tenantList);

            // Close modal
            Modal.hide('tenantForm');

            // Notification to users of tenant
            console.log('Perhaps following users need to be notified=', notifyUserList);
            Meteor.call('informTenantUser', notifyUserList, 'userRoleChange', tenant.name, (error, result) => {
              if (error) {
                sAlert.error('Error in notifying users', { timeout: 'none' });
              }
            });

            // Get success message translation
            let message = TAPi18n.__('tenantForm_addTenant_Success_Message');
            message = message.concat(tenant.name);

            // Inform user about success
            sAlert.success(message);

          } else {
            // Operation finished, inform spinner
            Session.set('tenantUpdateOngoing', false);
            // Tenant addition failure on manager side, save new tenant object to local array
            const errorMessage = `Tenant manager error! Returns code (${result.status}).`;
            sAlert.error(errorMessage, { timeout: 'none' });
            // tenantList.unshift(tenant);
          }
        }
        if (error) {
          // Operation finished, inform spinner
          Session.set('tenantUpdateOngoing', false);
          // Tenant addition failure on manager side, save new tenant object to local array
          const errorMessage = `Tenant operation failed!  (${error}).`;
          sAlert.error(errorMessage, { timeout: 'none' });
          // tenantList.unshift(tenant);
        }
      });
    }
  },

  'click #modify-tenant': function () {
    // get values of original tenant
    const originalTenant = this.tenantToModify;

    if ($('#add-tenant-name').val() === '') {
      sAlert.error('Tenant must have a name!', { timeout: 'none' });
    } else if ($('#add-tenant-description').val() === '') {
      sAlert.error('Tenant must have a description!', { timeout: 'none' });
    } else {
      // Update Tenant operation began, inform spinner
      Session.set('tenantUpdateOngoing', true);

      // initiate the object for changes
      // It will contain the id of tenant to be modified and the changes in an array
      const modifyTenantPayload = {};
      modifyTenantPayload.body = [];

      // Collect the data for the changed tenant
      // At first general fields
      const modifiedTenant = {
        name: $('#add-tenant-name').val(),
        id: originalTenant.id,
        description: $('#add-tenant-description').val(),
      };

      // Get possible users in changed tenant
      if (Session.get('tenantUsers')) {
        // Read list of users of the tenant at hand
        modifiedTenant.users = Session.get('tenantUsers');
      }

      // Any changes in name
      if (originalTenant.name !== modifiedTenant.name) {
        // Fill in tenant id
        modifyTenantPayload.id = originalTenant.id;
        // Fill in replace for name
        const changedDescription = {
          op: 'replace',
          value: $('#add-tenant-name').val(),
          path: '/name',
        };
        modifyTenantPayload.body.push(changedDescription);
      }

      // Any changes in description
      if (originalTenant.description !== modifiedTenant.description) {
        // Fill in tenant id
        modifyTenantPayload.id = originalTenant.id;
        // Fill in replace for description
        const changedDescription = {
          op: 'replace',
          value: $('#add-tenant-description').val(),
          path: '/description',
        };
        modifyTenantPayload.body.push(changedDescription);
      }

      // Logic for any changes in users
      /* First: checkings based on old tenant:
         - if user is present in old tenant, but not in new one
           -> fill "remove" op for user
         - if user is present in both, but no changes,
           -> remove user from NEW tenant user list
         - if user is present in both, and there are changes
           -> fill "replace" op for user
           -> remove user from NEW tenant user list

        Second: check remaining list of users in NEW tenant
        - if there are user(s) still on new list
          -> fill "add" op with new data
        - no users left
          -> all is done
       */

      const usersNeedChecking = [];
      const notifyChangedUsers = [];
      const notifyRemovedUsers = [];

       // Go through tenant's original user list and compare it against tenant's modified user list
       // Note! Must loop array from right to left in order to get user indexes in descending order,
       //       which makes server side handling possible
      const userChanges = originalTenant.users.reduceRight((changeList, origUser, index) => {
        let modifiedUserIndex = false;
        // Check if same user is present in modified tenant data
        const sameUserInModified = modifiedTenant.users.filter((user, modifiedIndex) => {
          // Return modified user if found
          if (user.id === origUser.id) {
            modifiedUserIndex = modifiedIndex;
            return true;
          }
          return false;
        });

        // If not found in modified user list, the user is removed
        if (sameUserInModified.length === 0) {
          modifyTenantPayload.id = originalTenant.id;
          let path = '/users/';
          // indicate user with original user data index
          path = path.concat(index);
          const removedUser = {
            op: 'remove',
            path,
          };
          // Add user to remove list
          changeList.push(removedUser);

          // Add user also to check list
          const checkPath = path.concat('/name');
          const checkUser = {
            op: 'test',
            value: origUser.name,
            path: checkPath,
          };
          // Add user to to-be-checked list
          usersNeedChecking.push(checkUser);

          // Add user to list for notification about removal
          notifyRemovedUsers.push(origUser);

          // If user data is modified, set user to be replaced
        } else if (origUser.consumer !== sameUserInModified[0].consumer ||
                   origUser.provider !== sameUserInModified[0].provider) {
          modifyTenantPayload.id = originalTenant.id;

          let path = '/users/';
          // indicate user with original user data index
          path = path.concat(index);
          const modifyPath = path.concat('/roles');

          // collect roles
          const tenantRoles = [];
          if (sameUserInModified[0].provider) {
            tenantRoles.push('data-provider');
          }
          if (sameUserInModified[0].consumer) {
            tenantRoles.push('data-consumer');
          }
          // add modified user info to list
          const modifiedUser = {
            op: 'replace',
            path: modifyPath,
            value: tenantRoles,
          };
          // Add user to change list
          changeList.push(modifiedUser);

          // Add user also to check list
          const checkPath = path.concat('/name');
          const checkUser = {
            op: 'test',
            value: origUser.name,
            path: checkPath,
          };
          // Add user to to-be-checked list
          usersNeedChecking.push(checkUser);

          // Add user to notification about modification list
          notifyChangedUsers.push(sameUserInModified[0]);

          // User data is changed, remove from modified list
          modifiedTenant.users.splice(modifiedUserIndex, 1);
        } else {
          // User data not changed, remove from modified list only
          modifiedTenant.users.splice(modifiedUserIndex, 1);
        }

        return changeList;
      }, []);

      // Include removed users to request
      if (userChanges.length > 0) {
        modifyTenantPayload.id = originalTenant.id;
        modifyTenantPayload.body = modifyTenantPayload.body.concat(userChanges);
      }

      // If there are any modified users left, they are to be added into request
      const newUsers = modifiedTenant.users.map((user) => {
        // Add user to notification about modification list
        notifyChangedUsers.push(user);

        // collect roles
        const tenantRoles = [];
        if (user.provider) {
          tenantRoles.push('data-provider');
        }
        if (user.consumer) {
          tenantRoles.push('data-consumer');
        }

        // collect user data
        const value = {
          id: user.id,
          name: user.name,
          roles: tenantRoles,
        };

        // Finalize request element
        const addedUser = {
          op: 'add',
          path: '/users/-',
          value,
        };
        return addedUser;
      });

      // Include added users to request
      if (newUsers.length > 0) {
        modifyTenantPayload.id = originalTenant.id;
        modifyTenantPayload.body = modifyTenantPayload.body.concat(newUsers);
      }

      // Check if modified users exist on server side
      const userCheckData = {};
      if (usersNeedChecking.length > 0) {
        userCheckData.id = originalTenant.id;
        // Indicates, that users need to be checked
        userCheckData.type = 'user';
        userCheckData.body = usersNeedChecking;
      }

      // At first PATCH with op code "check"
      Meteor.call('checkTenantUsers', userCheckData, (errorInCheck, resultInCheck) => {
        if (resultInCheck) {
          if (modifyTenantPayload.body.length > 0) {
            if (modifyTenantPayload.id) {
              // After users are successfully checked, PATCH /tenant
              Meteor.call('updateTenant', modifyTenantPayload, (error, result) => {
                if (result) {
                  if (result.status === 200) {
                    // New tenant successfully added on manager side, empty local list
                    const tenantList = [];
                    // Save to sessionStorage to be used while adding users to tenant
                    Session.set('tenantList', tenantList);

                    // Close modal
                    Modal.hide('tenantForm');

                    // if there are modified users, send notifications
                    if (notifyChangedUsers.length > 0) {
                      console.log('Perhaps following users need to be notified about change=', notifyChangedUsers);
                      Meteor.call('informTenantUser', notifyChangedUsers, 'userRoleChange', modifiedTenant.name, (notifyModifyError, notifyModifyResult) => {
                        if (notifyModifyError) {
                          sAlert.error('Error in notifying users', { timeout: 'none' });
                        }
                      });
                    }

                    if (notifyRemovedUsers.length > 0) {
                      // if there are removed users, send notifications
                      console.log('Perhaps following users need to be notified about removal=', notifyRemovedUsers);
                      Meteor.call('informTenantUser', notifyRemovedUsers, 'userRemoval', modifiedTenant.name, (notifyRemoveError, notifyRemoveResult) => {
                        if (notifyRemoveError) {
                          sAlert.error('Error in notifying users', { timeout: 'none' });
                        }
                      });
                    }

                    // Get success message translation
                    let message = TAPi18n.__('tenantForm_update_Success_Message');
                    // Alert user of success
                    message = message.concat(modifiedTenant.name);
                    sAlert.success(message);
                  } else {
                    // Operation finished, inform spinner
                    Session.set('tenantUpdateOngoing', false);

                    // Tenant update failure on manager side
                    let errorMessage = TAPi18n.__('tenantForm_update_Failure_Message');
                    errorMessage = errorMessage.concat(result);
                    sAlert.error(errorMessage, { timeout: 'none' });
                  }
                }
                if (error) {
                  // Operation finished, inform spinner
                  Session.set('tenantUpdateOngoing', false);

                  // Tenant addition failure on manager side, save new tenant object to local array
                  let errorMessage = TAPi18n.__('tenantForm_update_error_Message');
                  errorMessage = errorMessage.concat(error);
                  sAlert.error(errorMessage, { timeout: 'none' });
                }
              });
            } else {
              // Operation finished, inform spinner
              Session.set('tenantUpdateOngoing', false);

              // Get error message translation
              const errorMessage = TAPi18n.__('tenantForm_id_missing_Message');
              // Alert user of success
              sAlert.error(errorMessage, { timeout: 'none' });
            }
          } else {
            // Operation finished, inform spinner
            Session.set('tenantUpdateOngoing', false);

            // Get warning message translation
            const message = TAPi18n.__('tenantForm_noChanges_Message');
            // Alert user of success
            sAlert.warning(message);
          }
        }

        if (errorInCheck) {
          // Operation finished, inform spinner
          Session.set('tenantUpdateOngoing', false);

          // Tenant check failure on manager side, alert
          let errorMessage = TAPi18n.__('tenantForm_update_check_error_Message');
          errorMessage = errorMessage.concat(errorInCheck);
          sAlert.error(errorMessage, { timeout: 'none' });
        }
      });
    }
  },
});

Template.tenantForm.helpers({
  tenantUpdateOngoing () {
    const tenantUpdateOngoing = Session.get('tenantUpdateOngoing');
    // Return spinner status
    return tenantUpdateOngoing;
  },
});
